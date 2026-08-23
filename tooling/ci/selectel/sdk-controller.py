#!/usr/bin/env python3
"""Sniptale lifecycle policy over the official OpenStack SDK.

The controller intentionally owns no generic cloud protocol adapter. openstacksdk owns
Keystone/Nova/Cinder/Neutron/Glance behavior; this file owns only Sniptale resource
selection, JIT binding, proof, cleanup, and TTL policy.
"""

from __future__ import annotations

import argparse
import base64
import calendar
import hashlib
import json
import os
from pathlib import Path
import shlex
import sys
import time
from typing import Any
from urllib import error, request

import openstack
from openstack import exceptions


ROOT = Path(os.environ.get("SNIPTALE_REPOSITORY_ROOT", "/workspace")).resolve()
POLICY_PATH = ROOT / "tooling/configs/ci/selectel-runner.json"
SEMANTICS_PATH = ROOT / "tooling/configs/ci/proof-semantics.json"


def required(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"Missing Selectel controller value: {label}.")
    return value


def managed_resource_description(
    policy: dict[str, Any], run_id: str, run_attempt: str, profile_attempt: int, expires_at: int
) -> str:
    return ":".join(
        (
            policy["lifecycle"]["managedBy"],
            policy["repository"],
            run_id,
            run_attempt,
            str(profile_attempt),
            str(expires_at),
        )
    )


def parse_managed_resource_description(policy: dict[str, Any], resource):
    parts = (getattr(resource, "description", "") or "").split(":")
    if (
        len(parts) != 6
        or parts[0] != policy["lifecycle"]["managedBy"]
        or parts[1] != policy["repository"]
    ):
        return None
    numeric_values = tuple(
        zip(parts[2:], ("run ID", "run attempt", "profile attempt", "expiry"), strict=True)
    )
    for value, label in numeric_values:
        if not value.isdecimal() or str(int(value)) != value:
            raise RuntimeError(f"Managed Selectel resource {label} is not canonical.")
        if int(value) < 1:
            raise RuntimeError(f"Managed Selectel resource {label} must be positive.")
    profile_attempt = int(parts[4])
    if profile_attempt < 1 or profile_attempt > policy["lifecycle"]["maxProfiles"]:
        raise RuntimeError("Managed Selectel resource profile attempt is outside policy.")
    return {
        "runId": parts[2],
        "runAttempt": parts[3],
        "profileAttempt": profile_attempt,
        "expiresAt": int(parts[5]),
    }


def read_policy() -> dict[str, Any]:
    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    compute = policy.get("compute", {})
    zones = compute.get("allowedZones")
    boot_sizes = compute.get("allowedBootVolumeGiB")
    flavors = compute.get("allowedFlavors")
    profiles = compute.get("allowedResourceProfilesByFlavor")
    volume_types = compute.get("allowedVolumeTypesByZone")

    def positive_record(value, fields):
        return (
            isinstance(value, dict)
            and set(value) == set(fields)
            and all(
                not isinstance(value[field], bool)
                and isinstance(value[field], int)
                and value[field] > 0
                for field in fields
            )
        )

    flavor_fields = {"vcpus", "ramMiB"}
    profile_fields = {
        "cpuTokens", "memoryMiB", "vitestWorkers", "playwrightWorkers", "securityWorkers"
    }
    valid_shapes = (
        isinstance(zones, list)
        and bool(zones)
        and len(set(zones)) == len(zones)
        and all(isinstance(zone, str) and zone for zone in zones)
        and isinstance(boot_sizes, list)
        and bool(boot_sizes)
        and all(not isinstance(size, bool) and isinstance(size, int) and size > 0 for size in boot_sizes)
        and isinstance(flavors, dict)
        and bool(flavors)
        and all(positive_record(flavor, flavor_fields) for flavor in flavors.values())
        and isinstance(profiles, dict)
        and set(profiles) == set(flavors)
        and all(positive_record(profile, profile_fields) for profile in profiles.values())
        and isinstance(volume_types, dict)
        and set(volume_types) == set(zones)
        and all(
            isinstance(types, list)
            and bool(types)
            and all(isinstance(volume_type, str) and volume_type for volume_type in types)
            for types in volume_types.values()
        )
    )
    valid_capacity = valid_shapes and all(
        profiles[name]["cpuTokens"] <= flavor["vcpus"]
        and profiles[name]["memoryMiB"] < flavor["ramMiB"]
        and flavor["ramMiB"] - profiles[name]["memoryMiB"] >= 6144
        and all(
            profiles[name][worker] <= profiles[name]["cpuTokens"]
            for worker in ("vitestWorkers", "playwrightWorkers", "securityWorkers")
        )
        for name, flavor in flavors.items()
    )
    if (
        policy.get("schemaVersion") != 1
        or policy.get("artifactKind") != "sniptale-selectel-runner-policy"
        or policy.get("environment") != "selectel-runner-controller"
        or not valid_capacity
        or compute.get("preemptible") is not True
        or compute.get("publicIp") is not False
        or compute.get("ingress") is not False
        or policy.get("lifecycle", {}).get("maxProfiles") != 10
        or not isinstance(policy.get("repository"), str)
        or not policy.get("repository")
        or ":" in policy.get("repository", "")
        or not isinstance(policy.get("lifecycle", {}).get("managedBy"), str)
        or not policy.get("lifecycle", {}).get("managedBy")
        or ":" in policy.get("lifecycle", {}).get("managedBy", "")
        or policy.get("runner", {}).get("maxJobs") != 1
        or policy.get("network", {}).get("lifecycle") != "disposable-per-attempt"
        or not isinstance(policy.get("network", {}).get("securityGroupNamePrefix"), str)
        or policy.get("trust", {}).get("persistentNetworkResources") is not False
    ):
        raise RuntimeError("Malformed Selectel runner policy.")
    return policy


def read_profiles(policy: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    raw = required(os.environ.get("SELECTEL_QA_PROFILES"), "SELECTEL_QA_PROFILES")
    try:
        document = json.loads(raw)
    except json.JSONDecodeError as failure:
        raise RuntimeError("SELECTEL_QA_PROFILES is malformed JSON.") from failure
    if not isinstance(document, dict) or set(document) != {"profiles"}:
        raise RuntimeError("SELECTEL_QA_PROFILES must contain only profiles.")
    profiles = document["profiles"]
    if not isinstance(profiles, list) or not profiles:
        raise RuntimeError("SELECTEL_QA_PROFILES profiles must be a non-empty array.")
    if len(profiles) > policy["lifecycle"]["maxProfiles"]:
        raise RuntimeError("SELECTEL_QA_PROFILES exceeds the bounded profile count.")
    compute = policy["compute"]
    normalized_profiles = []
    seen = set()
    for index, profile in enumerate(profiles):
        if not isinstance(profile, dict) or set(profile) != {
            "zone", "flavor", "volumeType", "volumeGiB", "qa"
        }:
            raise RuntimeError(f"Selectel profile {index} has unknown or missing fields.")
        qa = profile["qa"]
        qa_fields = {
            "cpuTokens", "memoryMiB", "vitestWorkers", "playwrightWorkers", "securityWorkers"
        }
        if not isinstance(qa, dict) or set(qa) != qa_fields:
            raise RuntimeError(f"Selectel profile {index} QA resources are malformed.")
        if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in qa.values()):
            raise RuntimeError(f"Selectel profile {index} QA resources must be positive integers.")
        zone = profile["zone"]
        flavor_name = profile["flavor"]
        volume_type = profile["volumeType"]
        volume_gib = profile["volumeGiB"]
        flavor = compute["allowedFlavors"].get(flavor_name)
        if zone not in compute["allowedZones"] or flavor is None:
            raise RuntimeError(f"Selectel profile {index} uses an unknown zone or flavor.")
        if volume_type not in compute["allowedVolumeTypesByZone"].get(zone, []):
            raise RuntimeError(f"Selectel profile {index} uses an unknown volume type for its zone.")
        if isinstance(volume_gib, bool) or volume_gib not in compute["allowedBootVolumeGiB"]:
            raise RuntimeError(f"Selectel profile {index} uses an unsupported volume size.")
        if qa != compute["allowedResourceProfilesByFlavor"].get(flavor_name):
            raise RuntimeError(f"Selectel profile {index} uses an unknown flavor/resource combination.")
        if qa["cpuTokens"] > flavor["vcpus"] or qa["memoryMiB"] >= flavor["ramMiB"]:
            raise RuntimeError(f"Selectel profile {index} oversubscribes CPU or memory.")
        if flavor["ramMiB"] - qa["memoryMiB"] < 6144:
            raise RuntimeError(f"Selectel profile {index} does not reserve enough system memory.")
        if any(qa[name] > qa["cpuTokens"] for name in ("vitestWorkers", "playwrightWorkers", "securityWorkers")):
            raise RuntimeError(f"Selectel profile {index} workers exceed CPU tokens.")
        normalized = {
            "zone": zone,
            "flavor": flavor_name,
            "volumeType": volume_type,
            "volumeGiB": volume_gib,
            "qa": qa,
        }
        key = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
        if key in seen:
            raise RuntimeError(f"Selectel profile {index} duplicates an earlier profile.")
        seen.add(key)
        normalized_profiles.append(normalized)
    lane = os.environ.get("SNIPTALE_PROOF_LANE", "proof")
    if lane not in {"proof", "release"}:
        raise RuntimeError(f"Unknown Selectel proof lane: {lane}.")
    semantics = json.loads(SEMANTICS_PATH.read_text(encoding="utf-8"))
    minimum = semantics.get("reuseCompatibility", {}).get(lane, {}).get("minimumExecutionProfile")
    if not isinstance(minimum, dict):
        raise RuntimeError(f"Selectel {lane} minimum execution profile is missing.")
    for index, profile in enumerate(normalized_profiles):
        if any(profile["qa"].get(key, 0) < value for key, value in minimum.items()):
            raise RuntimeError(f"Selectel profile {index} is below the {lane} lane minimum.")
    normalized_document = json.dumps(
        {"profiles": normalized_profiles}, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return normalized_profiles, f"sha256:{hashlib.sha256(normalized_document.encode()).hexdigest()}"


def connect(policy: dict[str, Any]):
    environment = policy["controllerEnvironment"]
    region = required(os.environ.get("SELECTEL_OS_REGION_NAME"), "SELECTEL_OS_REGION_NAME")
    if region != environment["expectedRegion"]:
        raise RuntimeError("OpenStack region does not match policy.")
    connection = openstack.connection.Connection(
        auth_url=required(os.environ.get("SELECTEL_OS_AUTH_URL"), "SELECTEL_OS_AUTH_URL"),
        application_credential_id=required(
            os.environ.get("SELECTEL_OS_APPLICATION_CREDENTIAL_ID"),
            "SELECTEL_OS_APPLICATION_CREDENTIAL_ID",
        ),
        application_credential_secret=required(
            os.environ.get("SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET"),
            "SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET",
        ),
        auth_type="v3applicationcredential",
        region_name=region,
        compute_api_version=policy["compute"]["computeApiVersion"],
    )
    connection.authorize()
    project_id = required(connection.current_project_id, "authenticated project ID")
    digest = hashlib.sha256(project_id.encode()).hexdigest()
    if digest != environment["expectedProjectSha256"]:
        raise RuntimeError("OpenStack token project does not match policy.")
    return connection, project_id, f"sha256:{digest[:12]}"


def exact(resources, name: str, kind: str):
    matches = [resource for resource in resources if resource.name == name]
    if len(matches) > 1:
        raise RuntimeError(f"Selectel {kind} name collision.")
    return matches[0] if matches else None


def select_resources(connection, policy: dict[str, Any], placement: dict[str, Any]) -> dict[str, Any]:
    compute = policy["compute"]
    selector = policy["imageSelector"]
    zone = placement["zone"]
    zones = [
        item.name
        for item in connection.compute.availability_zones(details=False)
        if item.state.get("available")
    ]
    if zone not in zones:
        raise RuntimeError("Configured Selectel availability zone is unavailable.")
    flavors = [
        item
        for item in connection.compute.flavors(details=True)
        if item.name == placement["flavor"]
    ]
    if len(flavors) != 1:
        raise RuntimeError("Configured Selectel flavor is unavailable or ambiguous.")
    flavor = flavors[0]
    if (
        flavor.vcpus != compute["allowedFlavors"][placement["flavor"]]["vcpus"]
        or flavor.ram != compute["allowedFlavors"][placement["flavor"]]["ramMiB"]
        or flavor.disk != 0
    ):
        raise RuntimeError("Configured Selectel flavor drifted from the canonical resource profile.")
    images = []
    for image in connection.image.images(status="active"):
        if image.name == selector["name"]:
            images.append(image)
    images.sort(key=lambda item: str(item.created_at or ""), reverse=True)
    if not images:
        raise RuntimeError(f"No active {compute['operatingSystem']} amd64 image is available.")
    image = images[0]
    if int(image.min_disk or 0) > placement["volumeGiB"]:
        raise RuntimeError("Configured Selectel image no longer fits the canonical boot volume.")
    external = [item for item in connection.network.networks(is_router_external=True)]
    if len(external) != 1:
        raise RuntimeError("Expected exactly one Selectel external network.")
    volume_types = [
        item
        for item in connection.block_storage.types()
        if item.name == placement["volumeType"]
    ]
    if len(volume_types) != 1:
        raise RuntimeError("Configured Selectel boot volume type is unavailable.")
    return {
        "zone": zone,
        "flavor": flavor,
        "image": image,
        "external_network": external[0],
        "volume_type": volume_types[0],
    }


def create_security_group(connection, policy: dict[str, Any], name: str, description: str):
    security_group_name = f"{policy['network']['securityGroupNamePrefix']}-{name}"
    if list(connection.network.security_groups(name=security_group_name)):
        raise RuntimeError("Selectel runner security group name collision.")
    security_group = connection.network.create_security_group(
        name=security_group_name,
        description=description,
    )
    if any(rule.get("direction") == "ingress" for rule in security_group.security_group_rules):
        raise RuntimeError("Selectel managed runner security group unexpectedly permits ingress.")
    return security_group


def create_run_network(
    connection,
    selected: dict[str, Any],
    policy: dict[str, Any],
    name: str,
    description: str,
    record: dict[str, Any],
    persist,
):
    network_policy = policy["network"]
    names = {
        "network": f"{name}-network",
        "subnet": f"{name}-subnet",
        "router": f"{name}-router",
    }
    for kind, resource_name in names.items():
        collection = getattr(connection.network, f"{kind}s")
        if list(collection(name=resource_name)):
            raise RuntimeError(f"Selectel runner {kind} name collision.")
    network = connection.network.create_network(
        name=names["network"], admin_state_up=True, description=description
    )
    record["networkId"] = network.id
    persist()
    subnet = connection.network.create_subnet(
        name=names["subnet"],
        network_id=network.id,
        cidr=network_policy["subnetCidr"],
        ip_version=4,
        enable_dhcp=True,
        description=description,
    )
    record["subnetId"] = subnet.id
    persist()
    router = connection.network.create_router(
        name=names["router"],
        admin_state_up=True,
        external_gateway_info={"network_id": selected["external_network"].id},
        description=description,
    )
    record["routerId"] = router.id
    persist()
    connection.network.add_interface_to_router(router, subnet_id=subnet.id)
    all_router_ports = list(connection.network.ports(device_id=router.id))
    router_ports = [
        port
        for port in all_router_ports
        if any(fixed.get("subnet_id") == subnet.id for fixed in port.fixed_ips)
    ]
    if len(router_ports) != 1:
        raise RuntimeError("Selectel runner router interface is missing or ambiguous.")
    record["routerInterfacePortIds"] = [router_ports[0].id]
    record["routerPortIds"] = [port.id for port in all_router_ports]
    persist()
    security_group = create_security_group(connection, policy, name, description)
    record["securityGroupId"] = security_group.id
    persist()
    return network, subnet, security_group


def github_json(path: str, token: str, method="GET", body=None):
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    payload = None if body is None else json.dumps(body).encode()
    api_request = request.Request(
        f"https://api.github.com{path}", data=payload, headers=headers, method=method
    )
    try:
        with request.urlopen(api_request, timeout=30) as response:
            if response.status == 204:
                return None
            return json.load(response)
    except error.HTTPError as failure:
        raise RuntimeError(f"GitHub runner controller request failed with HTTP {failure.code}.") from None


def create_jit_runner(policy: dict[str, Any], token: str, name: str, label: str):
    payload = github_json(
        f"/repos/{policy['repository']}/actions/runners/generate-jitconfig",
        token,
        method="POST",
        body={
            "name": name,
            "runner_group_id": 1,
            "labels": ["self-hosted", "Linux", "X64", label],
            "work_folder": policy["runner"]["workFolder"],
        },
    )
    runner_id = payload.get("runner", {}).get("id")
    encoded = payload.get("encoded_jit_config")
    if not isinstance(runner_id, int) or not isinstance(encoded, str):
        raise RuntimeError("Malformed GitHub JIT runner response.")
    return runner_id, encoded


def delete_runner(policy: dict[str, Any], token: str, runner_id: int):
    try:
        github_json(
            f"/repos/{policy['repository']}/actions/runners/{runner_id}", token, method="DELETE"
        )
    except RuntimeError as failure:
        if "HTTP 404" not in str(failure):
            raise


def wait_runner_online(policy: dict[str, Any], token: str, runner_id: int):
    deadline = time.monotonic() + policy["runner"]["onlineTimeoutSeconds"]
    while time.monotonic() < deadline:
        payload = github_json(
            f"/repos/{policy['repository']}/actions/runners/{runner_id}", token
        )
        if payload.get("status") == "online":
            return
        time.sleep(5)
    raise RuntimeError("Selectel JIT runner did not become online before the canonical timeout.")


def cloud_init(
    policy: dict[str, Any],
    jit_config: str,
    image_reference: str,
):
    if not image_reference.startswith("ghcr.io/lrozhkov/sniptale-qa@sha256:"):
        raise RuntimeError("Selectel runner requires an immutable QA image reference.")
    archive = policy["runner"]["archive"]
    metadata_deny = (
        "iptables --wait --insert DOCKER-USER 1 --destination 169.254.169.254/32 --jump REJECT && "
        "iptables --wait --check DOCKER-USER --destination 169.254.169.254/32 --jump REJECT"
    )
    metadata_guard = (
        "iptables --wait --check DOCKER-USER --destination 169.254.169.254/32 --jump REJECT"
    )
    runner_command = (
        f"{metadata_guard} && cd /opt/actions-runner && "
        "runuser -u runner -- ./run.sh --jitconfig \"$(cat /run/sniptale-jit)\"; "
        "status=$?; shred -u /run/sniptale-jit || rm -f /run/sniptale-jit; exit $status"
    )
    jit_install = (
        "install -m 600 /dev/null /run/sniptale-jit && "
        f"printf %s {shlex.quote(jit_config)} > /run/sniptale-jit"
    )
    cloud_scrub = (
        "shred -u /var/lib/cloud/instance/user-data.txt "
        "/var/lib/cloud/instance/scripts/runcmd 2>/dev/null || true"
    )
    source = f"""#cloud-config
package_update: true
packages: [ca-certificates, curl, docker.io, git, iptables, jq]
runcmd:
  - [systemctl, enable, --now, docker]
  - [useradd, --create-home, --shell, /bin/bash, runner]
  - [usermod, --append, --groups, docker, runner]
  - [mkdir, --parents, /opt/actions-runner]
  - [curl, --fail, --location, --silent, --show-error, --output, /tmp/{archive}, {policy['runner']['url']}]
  - [bash, -c, {json.dumps(f"echo '{policy['runner']['sha256']}  /tmp/{archive}' | sha256sum --check --strict")}]
  - [tar, --extract, --gzip, --file, /tmp/{archive}, --directory, /opt/actions-runner]
  - [chown, --recursive, runner:runner, /opt/actions-runner]
  - [docker, pull, {image_reference}]
  - [bash, -c, {json.dumps(metadata_deny)}]
  - [bash, -c, {json.dumps(jit_install)}]
  - [bash, -c, {json.dumps(cloud_scrub)}]
  - [bash, -c, {json.dumps(runner_command)}]
"""
    return base64.b64encode(source.encode()).decode(), f"sha256:{hashlib.sha256(source.encode()).hexdigest()}"


def record_path() -> Path:
    return ROOT / "build/selectel-controller/provision.json"


def write_record(destination: Path, record: dict[str, Any]):
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


def server_failure(connection, server_id: str | None, failure: Exception):
    result = {"kind": type(failure).__name__}
    if not server_id:
        return result
    try:
        server = connection.compute.get_server(server_id)
    except exceptions.SDKException:
        return result
    fault = server.fault if isinstance(server.fault, dict) else {}
    code = fault.get("code")
    message = fault.get("message")
    if isinstance(code, int):
        result["code"] = code
    if isinstance(message, str) and message.strip():
        result["message"] = " ".join(message.split())[:500]
    return result


def cleanup_failure(failure: Exception):
    result = {"kind": type(failure).__name__}
    message = str(failure)
    if message.strip():
        result["message"] = " ".join(message.split())[:500]
    return result


def is_profile_fallback_failure(failure: Exception) -> bool:
    if isinstance(failure, exceptions.SDKException):
        return True
    message = str(failure)
    return any(
        marker in message
        for marker in (
            "availability zone is unavailable",
            "flavor is unavailable or ambiguous",
            "volume type is unavailable or ambiguous",
            "wait_for_status",
            "wait_for_server",
            "did not become online",
            "server is not confirmed preemptible",
        )
    )


def cleanup(connection, policy: dict[str, Any], token: str, record: dict[str, Any]):
    result = {
        "runner": "absent",
        "server": "absent",
        "ports": "absent",
        "securityGroups": "absent",
        "routerPorts": "absent",
        "router": "absent",
        "subnet": "absent",
        "network": "absent",
        "volumes": "absent",
    }
    record["cleanup"] = result
    failures = []

    if record.get("serverId"):
        try:
            server = connection.compute.find_server(record["serverId"], ignore_missing=True)
            if server is not None:
                connection.compute.delete_server(server, ignore_missing=True)
                connection.compute.wait_for_delete(server, interval=2, wait=120)
                result["server"] = "deleted"
        except Exception as failure:
            result["server"] = "failed"
            failures.append(("server", failure))
    for port_id in record.get("portIds", []):
        try:
            connection.network.delete_port(port_id, ignore_missing=True)
            if connection.network.find_port(port_id, ignore_missing=True) is not None:
                raise RuntimeError("Selectel runner port survived cleanup.")
            result["ports"] = "deleted"
        except Exception as failure:
            result["ports"] = "failed"
            failures.append(("ports", failure))
    if record.get("securityGroupId"):
        try:
            security_group = connection.network.find_security_group(
                record["securityGroupId"], ignore_missing=True
            )
            if security_group is not None:
                connection.network.delete_security_group(security_group, ignore_missing=True)
            if connection.network.find_security_group(
                record["securityGroupId"], ignore_missing=True
            ) is not None:
                raise RuntimeError("Selectel runner security group survived cleanup.")
            result["securityGroups"] = "deleted"
        except Exception as failure:
            result["securityGroups"] = "failed"
            failures.append(("securityGroups", failure))
    router = None
    subnet = None
    try:
        if record.get("routerId"):
            router = connection.network.find_router(record["routerId"], ignore_missing=True)
        if record.get("subnetId"):
            subnet = connection.network.find_subnet(record["subnetId"], ignore_missing=True)
        if router is not None and subnet is not None:
            connection.network.remove_interface_from_router(router, subnet_id=subnet.id)
        for port_id in record.get("routerInterfacePortIds", []):
            if connection.network.find_port(port_id, ignore_missing=True) is not None:
                raise RuntimeError("Selectel runner router interface port survived cleanup.")
    except Exception as failure:
        result["routerPorts"] = "failed"
        failures.append(("routerPorts", failure))
    try:
        if router is not None:
            connection.network.delete_router(router, ignore_missing=True)
        if record.get("routerId") and connection.network.find_router(
            record["routerId"], ignore_missing=True
        ) is not None:
            raise RuntimeError("Selectel runner router survived cleanup.")
        for port_id in record.get("routerPortIds", []):
            if connection.network.find_port(port_id, ignore_missing=True) is not None:
                raise RuntimeError("Selectel runner router port survived router cleanup.")
        if record.get("routerId"):
            result["router"] = "deleted"
        if record.get("routerPortIds"):
            result["routerPorts"] = "deleted"
    except Exception as failure:
        result["router"] = "failed"
        failures.append(("router", failure))
    try:
        if subnet is not None:
            connection.network.delete_subnet(subnet, ignore_missing=True)
        if record.get("subnetId") and connection.network.find_subnet(
            record["subnetId"], ignore_missing=True
        ) is not None:
            raise RuntimeError("Selectel runner subnet survived cleanup.")
        if record.get("subnetId"):
            result["subnet"] = "deleted"
    except Exception as failure:
        result["subnet"] = "failed"
        failures.append(("subnet", failure))
    try:
        network = None
        if record.get("networkId"):
            network = connection.network.find_network(record["networkId"], ignore_missing=True)
        if network is not None:
            connection.network.delete_network(network, ignore_missing=True)
        if record.get("networkId") and connection.network.find_network(
            record["networkId"], ignore_missing=True
        ) is not None:
            raise RuntimeError("Selectel runner network survived cleanup.")
        if record.get("networkId"):
            result["network"] = "deleted"
    except Exception as failure:
        result["network"] = "failed"
        failures.append(("network", failure))
    for volume_id in record.get("volumeIds", []):
        try:
            volume = connection.block_storage.find_volume(volume_id, ignore_missing=True)
            if volume is not None:
                connection.block_storage.delete_volume(volume, ignore_missing=True)
                connection.block_storage.wait_for_delete(volume, interval=2, wait=120)
                result["volumes"] = "deleted"
        except Exception as failure:
            result["volumes"] = "failed"
            failures.append(("volumes", failure))
    if record.get("runnerId"):
        try:
            delete_runner(policy, token, record["runnerId"])
            result["runner"] = "deleted"
        except Exception as failure:
            result["runner"] = "failed"
            failures.append(("runner", failure))
    if failures:
        details = "; ".join(
            f"{owner}: {type(failure).__name__}: {' '.join(str(failure).split())[:500]}"
            for owner, failure in failures
        )
        raise RuntimeError(f"Selectel cleanup incomplete: {details}")
    return result


def cleanup_with_retries(
    policy: dict[str, Any], token: str, record: dict[str, Any], connection=None
):
    failure = None
    for attempt in range(1, 4):
        try:
            active_connection = connection if connection is not None else connect(policy)[0]
            return cleanup(active_connection, policy, token, record), attempt
        except Exception as current_failure:
            failure = current_failure
            record["cleanupAttempts"] = attempt
            record["cleanupFailure"] = cleanup_failure(current_failure)
            connection = None
            if attempt < 3:
                time.sleep(5)
    raise failure


def preflight(policy: dict[str, Any]):
    profiles, profiles_digest = read_profiles(policy)
    connection, _, project = connect(policy)
    placements = []
    for index, placement in enumerate(profiles):
        selected = select_resources(connection, policy, placement)
        placements.append(
            {
                "availabilityZone": selected["zone"],
                "profileIndex": index,
                "image": {"id": selected["image"].id, "name": selected["image"].name},
                "flavor": {
                    "id": selected["flavor"].id,
                    "name": selected["flavor"].name,
                    "vcpus": selected["flavor"].vcpus,
                    "ramMiB": selected["flavor"].ram,
                },
                "volumeType": selected["volume_type"].name,
                "volumeGiB": placement["volumeGiB"],
                "resourceProfile": placement["qa"],
            }
        )
    proof = {
        "schemaVersion": 2,
        "artifactKind": "sniptale-selectel-connectivity-proof",
        "project": project,
        "region": policy["controllerEnvironment"]["expectedRegion"],
        "profilesDigest": profiles_digest,
        "placements": placements,
        "externalNetwork": {
            "id": selected["external_network"].id,
            "name": selected["external_network"].name,
        },
        "admission": "resource creation is authoritative; quotas are not inferred",
    }
    destination = ROOT / "build/selectel-controller/preflight.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(destination.relative_to(ROOT))


def provision(policy: dict[str, Any]):
    profiles, profiles_digest = read_profiles(policy)
    run_id = required(os.environ.get("GITHUB_RUN_ID"), "GITHUB_RUN_ID")
    run_attempt = required(os.environ.get("GITHUB_RUN_ATTEMPT"), "GITHUB_RUN_ATTEMPT")
    candidate_sha = required(os.environ.get("SNIPTALE_CANDIDATE_SHA"), "SNIPTALE_CANDIDATE_SHA")
    base_sha = required(os.environ.get("SNIPTALE_BASE_SHA"), "SNIPTALE_BASE_SHA")
    trusted_control_sha = required(
        os.environ.get("SNIPTALE_TRUSTED_CONTROL_SHA"), "SNIPTALE_TRUSTED_CONTROL_SHA"
    )
    image_reference = required(os.environ.get("SNIPTALE_QA_IMAGE"), "SNIPTALE_QA_IMAGE")
    token = required(os.environ.get("RUNNER_CONTROLLER_TOKEN"), "RUNNER_CONTROLLER_TOKEN")
    connection, _, project = connect(policy)
    destination = record_path()
    if destination.exists():
        raise RuntimeError("Refusing Selectel controller record collision.")
    controller_record = {
        "schemaVersion": 4,
        "artifactKind": "sniptale-selectel-provision-record",
        "runId": run_id,
        "candidateSha": candidate_sha,
        "baseSha": base_sha,
        "trustedControlSha": trusted_control_sha,
        "qaImage": image_reference,
        "profilesDigest": profiles_digest,
        "project": project,
        "region": policy["controllerEnvironment"]["expectedRegion"],
        "selectedProfileIndex": None,
        "attempts": [],
        "status": "provisioning",
    }
    write_record(destination, controller_record)
    expires_at_epoch = int(time.time() + policy["lifecycle"]["ttlSeconds"])
    common_metadata = {
        "managed-by": policy["lifecycle"]["managedBy"],
        "repository": policy["repository"],
        "workflow": required(os.environ.get("GITHUB_WORKFLOW"), "GITHUB_WORKFLOW"),
        "run-id": run_id,
        "run-attempt": run_attempt,
        "candidate-sha": candidate_sha,
        "expires-at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(expires_at_epoch)),
    }
    last_failure = None
    for profile_index, placement in enumerate(profiles):
        attempt = str(profile_index + 1)
        name = f"sniptale-{run_id}-{run_attempt}-{attempt}"
        label = f"{policy['runner']['labelPrefix']}{run_id}-{run_attempt}-{attempt}"
        if any(server.name == name for server in connection.compute.servers(name=name)):
            raise RuntimeError("Selectel runner server name collision.")
        record = {
            "profileIndex": profile_index,
            "availabilityZone": placement["zone"],
            "bootVolumeType": placement["volumeType"],
            "bootVolumeGiB": placement["volumeGiB"],
            "imageId": None,
            "flavorId": None,
            "flavorName": placement["flavor"],
            "resourceProfile": placement["qa"],
            "preemptible": False,
            "publicIp": False,
            "runnerId": None,
            "runnerName": name,
            "runnerLabel": label,
            "serverId": None,
            "portIds": [],
            "securityGroupId": None,
            "routerPortIds": [],
            "routerInterfacePortIds": [],
            "routerId": None,
            "subnetId": None,
            "networkId": None,
            "volumeIds": [],
            "status": "provisioning",
            "failure": None,
            "cleanupAttempts": 0,
            "cleanup": None,
        }
        controller_record["attempts"].append(record)
        write_record(destination, controller_record)
        try:
            selected = select_resources(connection, policy, placement)
            description = managed_resource_description(
                policy, run_id, run_attempt, profile_index + 1, expires_at_epoch
            )
            network, subnet, security_group = create_run_network(
                connection,
                selected,
                policy,
                name,
                description,
                record,
                lambda: write_record(destination, controller_record),
            )
            record["imageId"] = selected["image"].id
            record["flavorId"] = selected["flavor"].id
            runner_id, jit_config = create_jit_runner(policy, token, name, label)
            record["runnerId"] = runner_id
            user_data, user_data_digest = cloud_init(policy, jit_config, image_reference)
            record["cloudInitDigest"] = user_data_digest
            metadata = {**common_metadata, "profile-index": str(profile_index)}
            write_record(destination, controller_record)
            volume_name = f"{name}-boot"
            if list(connection.block_storage.volumes(name=volume_name)):
                raise RuntimeError("Selectel runner boot volume name collision.")
            volume = connection.block_storage.create_volume(
                name=volume_name,
                size=placement["volumeGiB"],
                image_id=selected["image"].id,
                volume_type=selected["volume_type"].name,
                availability_zone=selected["zone"],
                metadata=metadata,
            )
            record["volumeIds"] = [volume.id]
            write_record(destination, controller_record)
            volume = connection.block_storage.wait_for_status(
                volume, status="available", failures=["error"], interval=5, wait=600
            )
            port_name = f"{name}-port"
            if list(connection.network.ports(name=port_name)):
                raise RuntimeError("Selectel runner port name collision.")
            port = connection.network.create_port(
                name=port_name,
                network_id=network.id,
                fixed_ips=[{"subnet_id": subnet.id}],
                security_group_ids=[security_group.id],
                admin_state_up=True,
                description=description,
            )
            record["portIds"] = [port.id]
            write_record(destination, controller_record)
            server = connection.compute.create_server(
                name=name,
                flavor_id=selected["flavor"].id,
                availability_zone=selected["zone"],
                networks=[{"port": port.id}],
                metadata=metadata,
                tags=["preemptible"],
                user_data=user_data,
                block_device_mapping_v2=[
                    {
                        "boot_index": 0,
                        "uuid": volume.id,
                        "source_type": "volume",
                        "destination_type": "volume",
                        "delete_on_termination": True,
                    }
                ],
            )
            record["serverId"] = server.id
            write_record(destination, controller_record)
            server = connection.compute.wait_for_server(
                server, status="ACTIVE", failures=["ERROR"], interval=5, wait=600
            )
            if "preemptible" not in (server.tags or []):
                raise RuntimeError("Selectel runner server is not confirmed preemptible.")
            addresses = [address for values in (server.addresses or {}).values() for address in values]
            if any(address.get("OS-EXT-IPS:type") == "floating" for address in addresses):
                raise RuntimeError("Selectel runner server unexpectedly has a public floating IP.")
            record["preemptible"] = True
            wait_runner_online(policy, token, runner_id)
            record["status"] = "online"
            controller_record.update(record)
            controller_record["selectedProfileIndex"] = profile_index
            controller_record["status"] = "online"
            write_record(destination, controller_record)
            print(json.dumps({"record": str(destination.relative_to(ROOT)), "label": label}))
            return
        except Exception as failure:
            last_failure = failure
            record["failure"] = server_failure(connection, record["serverId"], failure)
            record["status"] = "provision-failed"
            write_record(destination, controller_record)
            try:
                record["cleanup"], record["cleanupAttempts"] = cleanup_with_retries(
                    policy, token, record, connection
                )
            except Exception:
                record["status"] = "cleanup-failed"
                controller_record["status"] = "cleanup-failed"
                write_record(destination, controller_record)
                raise
            record["status"] = "cleaned-after-provision-failure"
            write_record(destination, controller_record)
            if not is_profile_fallback_failure(failure):
                controller_record["status"] = "admission-failed"
                write_record(destination, controller_record)
                raise
    controller_record["status"] = "profiles-exhausted"
    write_record(destination, controller_record)
    raise RuntimeError(f"All Selectel QA profiles were exhausted: {type(last_failure).__name__}")


def cleanup_command(policy: dict[str, Any], record_file: str):
    destination = Path(record_file).resolve()
    record = json.loads(destination.read_text(encoding="utf-8"))
    if record.get("artifactKind") != "sniptale-selectel-provision-record" or record.get(
        "status"
    ) not in {"online", "cleanup-failed", "profiles-exhausted", "admission-failed"}:
        raise RuntimeError("Malformed Selectel provision record.")
    token = required(os.environ.get("RUNNER_CONTROLLER_TOKEN"), "RUNNER_CONTROLLER_TOKEN")
    targets = [record]
    if record.get("status") in {
        "cleanup-failed", "profiles-exhausted", "admission-failed"
    } and isinstance(record.get("attempts"), list):
        targets = [
            attempt
            for attempt in record["attempts"]
            if attempt.get("status") not in {"cleaned", "cleaned-after-provision-failure"}
            and (
                attempt.get("runnerId")
                or attempt.get("serverId")
                or attempt.get("portIds")
                or attempt.get("securityGroupId")
                or attempt.get("routerPortIds")
                or attempt.get("routerInterfacePortIds")
                or attempt.get("routerId")
                or attempt.get("subnetId")
                or attempt.get("networkId")
                or attempt.get("volumeIds")
            )
        ]
        if not targets and record.get("status") == "cleanup-failed":
            raise RuntimeError("Cleanup-failed Selectel record has no replayable resources.")
        if not targets:
            record["cleanup"] = {"status": "already-cleaned"}
            record["cleanupAttempts"] = 0
            record["status"] = "cleaned"
            record["cleanupFailure"] = None
            write_record(destination, record)
            print(json.dumps(record["cleanup"]))
            return
    try:
        for target in targets:
            target["cleanup"], target["cleanupAttempts"] = cleanup_with_retries(
                policy, token, target
            )
            target["status"] = "cleaned"
    except Exception:
        record["status"] = "cleanup-failed"
        write_record(destination, record)
        raise
    record["cleanup"] = targets[-1]["cleanup"]
    record["cleanupAttempts"] = sum(target.get("cleanupAttempts", 0) for target in targets)
    record["status"] = "cleaned"
    record["cleanupFailure"] = None
    write_record(destination, record)
    print(json.dumps(record["cleanup"]))


def recover_cleanup(policy: dict[str, Any], record_file: str):
    run_id = required(os.environ.get("GITHUB_RUN_ID"), "GITHUB_RUN_ID")
    run_attempt = required(os.environ.get("GITHUB_RUN_ATTEMPT"), "GITHUB_RUN_ATTEMPT")
    token = required(os.environ.get("RUNNER_CONTROLLER_TOKEN"), "RUNNER_CONTROLLER_TOKEN")
    connection, _, project = connect(policy)
    prefix = f"sniptale-{run_id}-{run_attempt}-"
    attempts: dict[int, dict[str, Any]] = {}

    def owned_profile_attempt(metadata: dict[str, Any]):
        if (
            metadata.get("managed-by") != policy["lifecycle"]["managedBy"]
            or metadata.get("repository") != policy["repository"]
            or metadata.get("run-id") != run_id
            or metadata.get("run-attempt") != run_attempt
        ):
            return None
        raw_profile_index = metadata.get("profile-index")
        try:
            profile_index = int(raw_profile_index)
        except (TypeError, ValueError) as failure:
            raise RuntimeError("Recovered Selectel profile index is malformed.") from failure
        if str(profile_index) != raw_profile_index:
            raise RuntimeError("Recovered Selectel profile index is not canonical.")
        profile_attempt = profile_index + 1
        if profile_attempt < 1 or profile_attempt > policy["lifecycle"]["maxProfiles"]:
            raise RuntimeError("Recovered Selectel profile attempt is outside policy.")
        return profile_attempt

    def target(profile_attempt: int):
        if profile_attempt < 1 or profile_attempt > policy["lifecycle"]["maxProfiles"]:
            raise RuntimeError("Recovered Selectel profile attempt is outside policy.")
        return attempts.setdefault(profile_attempt, {
            "profileIndex": profile_attempt - 1,
            "runnerId": None,
            "serverId": None,
            "portIds": [],
            "securityGroupId": None,
            "routerPortIds": [],
            "routerInterfacePortIds": [],
            "routerId": None,
            "subnetId": None,
            "networkId": None,
            "volumeIds": [],
            "status": "cleanup-failed",
        })

    def profile_from_description(resource):
        identity = parse_managed_resource_description(policy, resource)
        if (
            identity is None
            or identity["runId"] != run_id
            or identity["runAttempt"] != run_attempt
        ):
            return None
        return identity["profileAttempt"]

    def assign(profile_attempt: int, key: str, value):
        record = target(profile_attempt)
        if record[key] is not None:
            raise RuntimeError(f"Recovered Selectel {key} is ambiguous.")
        record[key] = value

    for server in connection.compute.servers(details=True):
        metadata = server.metadata or {}
        profile_attempt = owned_profile_attempt(metadata)
        if profile_attempt is not None:
            assign(profile_attempt, "serverId", server.id)
    for volume in connection.block_storage.volumes(details=True):
        metadata = volume.metadata or {}
        profile_attempt = owned_profile_attempt(metadata)
        if profile_attempt is not None:
            target(profile_attempt)["volumeIds"].append(volume.id)
    for key, resources in (
        ("portIds", connection.network.ports()),
        ("routerId", connection.network.routers()),
        ("subnetId", connection.network.subnets()),
        ("networkId", connection.network.networks()),
        ("securityGroupId", connection.network.security_groups()),
    ):
        for resource in resources:
            profile_attempt = profile_from_description(resource)
            if profile_attempt is None:
                continue
            if key == "portIds":
                target(profile_attempt)[key].append(resource.id)
            else:
                assign(profile_attempt, key, resource.id)
    for profile_attempt, record in attempts.items():
        if record["routerId"]:
            router_ports = list(connection.network.ports(device_id=record["routerId"]))
            record["routerPortIds"] = [port.id for port in router_ports]
            record["routerInterfacePortIds"] = [
                port.id
                for port in router_ports
                if getattr(port, "device_owner", "") == "network:router_interface"
            ]
    runners = github_json(
        f"/repos/{policy['repository']}/actions/runners?per_page=100", token
    ).get("runners", [])
    for runner in runners:
        name = runner.get("name", "")
        if name.startswith(prefix):
            profile_attempt = int(name.removeprefix(prefix))
            assign(profile_attempt, "runnerId", runner["id"])
    destination = Path(record_file).resolve()
    record = {
        "schemaVersion": 4,
        "artifactKind": "sniptale-selectel-provision-record",
        "runId": run_id,
        "runAttempt": run_attempt,
        "project": project,
        "region": policy["controllerEnvironment"]["expectedRegion"],
        "attempts": [attempts[index] for index in sorted(attempts)],
        "status": "cleanup-failed" if attempts else "cleaned",
        "cleanup": None if attempts else {"status": "already-absent"},
    }
    write_record(destination, record)
    if attempts:
        cleanup_command(policy, str(destination))
    else:
        print(json.dumps(record["cleanup"]))


def sweep(policy: dict[str, Any]):
    connection, _, project = connect(policy)
    token = required(os.environ.get("RUNNER_CONTROLLER_TOKEN"), "RUNNER_CONTROLLER_TOKEN")
    now = time.time()

    def expired(metadata):
        if metadata.get("managed-by") != policy["lifecycle"]["managedBy"]:
            return False
        try:
            return calendar.timegm(
                time.strptime(metadata["expires-at"], "%Y-%m-%dT%H:%M:%SZ")
            ) <= now
        except (KeyError, ValueError):
            return False

    def expired_description(resource):
        identity = parse_managed_resource_description(policy, resource)
        return identity is not None and identity["expiresAt"] <= now

    all_servers = list(connection.compute.servers(details=True))
    servers = [
        server
        for server in all_servers
        if expired(server.metadata or {})
        or (
            (server.metadata or {}).get("managed-by") == policy["lifecycle"]["managedBy"]
            and server.status in {"SHUTOFF", "ERROR"}
        )
    ]
    for server in servers:
        connection.compute.delete_server(server, ignore_missing=True)
        connection.compute.wait_for_delete(server, interval=2, wait=120)
    deleted_identities = {
        ((server.metadata or {}).get("run-id"), (server.metadata or {}).get("run-attempt"))
        for server in servers
    }
    volumes = [
        volume
        for volume in connection.block_storage.volumes(details=True)
        if expired(volume.metadata or {})
        or (
            (volume.metadata or {}).get("managed-by") == policy["lifecycle"]["managedBy"]
            and (
                (volume.metadata or {}).get("run-id"),
                (volume.metadata or {}).get("run-attempt"),
            )
            in deleted_identities
        )
    ]
    for volume in volumes:
        connection.block_storage.delete_volume(volume, ignore_missing=True)
        connection.block_storage.wait_for_delete(volume, interval=2, wait=120)
    ports = [
        port
        for port in connection.network.ports()
        if expired_description(port)
    ]
    for port in ports:
        connection.network.delete_port(port, ignore_missing=True)
        if connection.network.find_port(port.id, ignore_missing=True) is not None:
            raise RuntimeError("Expired Selectel runner port survived sweep cleanup.")
    routers = [router for router in connection.network.routers() if expired_description(router)]
    router_port_ids = []
    for router in routers:
        interface_ports = [
            port
            for port in connection.network.ports(device_id=router.id)
            if getattr(port, "device_owner", "") == "network:router_interface"
        ]
        for port in interface_ports:
            subnet_ids = [fixed.get("subnet_id") for fixed in port.fixed_ips if fixed.get("subnet_id")]
            if len(subnet_ids) != 1:
                raise RuntimeError("Expired Selectel router interface is malformed.")
            connection.network.remove_interface_from_router(router, subnet_id=subnet_ids[0])
            if connection.network.find_port(port.id, ignore_missing=True) is not None:
                raise RuntimeError("Expired Selectel router interface survived sweep cleanup.")
            router_port_ids.append(port.id)
        connection.network.delete_router(router, ignore_missing=True)
        if connection.network.find_router(router.id, ignore_missing=True) is not None:
            raise RuntimeError("Expired Selectel router survived sweep cleanup.")
    subnets = [subnet for subnet in connection.network.subnets() if expired_description(subnet)]
    for subnet in subnets:
        connection.network.delete_subnet(subnet, ignore_missing=True)
        if connection.network.find_subnet(subnet.id, ignore_missing=True) is not None:
            raise RuntimeError("Expired Selectel subnet survived sweep cleanup.")
    networks = [network for network in connection.network.networks() if expired_description(network)]
    for network in networks:
        connection.network.delete_network(network, ignore_missing=True)
        if connection.network.find_network(network.id, ignore_missing=True) is not None:
            raise RuntimeError("Expired Selectel network survived sweep cleanup.")
    security_groups = [
        security_group
        for security_group in connection.network.security_groups()
        if expired_description(security_group)
    ]
    for security_group in security_groups:
        connection.network.delete_security_group(security_group, ignore_missing=True)
        if connection.network.find_security_group(security_group.id, ignore_missing=True) is not None:
            raise RuntimeError("Expired Selectel security group survived sweep cleanup.")
    expired_runner_names = {server.name for server in servers}
    for resource in [*ports, *routers, *subnets, *networks, *security_groups]:
        identity = parse_managed_resource_description(policy, resource)
        if identity is not None:
            expired_runner_names.add(
                f"sniptale-{identity['runId']}-{identity['runAttempt']}-{identity['profileAttempt']}"
            )
    runners = github_json(
        f"/repos/{policy['repository']}/actions/runners?per_page=100", token
    ).get("runners", [])
    offline = [
        runner
        for runner in runners
        if runner.get("name") in expired_runner_names and runner.get("status") == "offline"
    ]
    for runner in offline:
        delete_runner(policy, token, runner["id"])
    proof = {
        "schemaVersion": 3,
        "artifactKind": "sniptale-selectel-sweep-proof",
        "project": project,
        "region": policy["controllerEnvironment"]["expectedRegion"],
        "deleted": {
            "servers": [item.id for item in servers],
            "volumes": [item.id for item in volumes],
            "ports": [item.id for item in ports],
            "routerPorts": router_port_ids,
            "routers": [item.id for item in routers],
            "subnets": [item.id for item in subnets],
            "networks": [item.id for item in networks],
            "securityGroups": [item.id for item in security_groups],
            "runners": [item["id"] for item in offline],
        },
    }
    destination = ROOT / "build/selectel-controller/sweep.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command", choices=["preflight", "provision", "cleanup", "recover-cleanup", "sweep"]
    )
    parser.add_argument("record", nargs="?")
    arguments = parser.parse_args()
    policy = read_policy()
    if arguments.command == "preflight":
        preflight(policy)
    elif arguments.command == "provision":
        provision(policy)
    elif arguments.command == "cleanup":
        cleanup_command(policy, required(arguments.record, "attempt record"))
    elif arguments.command == "recover-cleanup":
        recover_cleanup(policy, required(arguments.record, "recovery record"))
    else:
        sweep(policy)


if __name__ == "__main__":
    try:
        main()
    except (exceptions.SDKException, RuntimeError) as failure:
        print(f"Selectel controller failed: {failure}", file=sys.stderr)
        sys.exit(1)
