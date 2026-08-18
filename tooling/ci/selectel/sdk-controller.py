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


def required(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"Missing Selectel controller value: {label}.")
    return value


def read_policy() -> dict[str, Any]:
    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    if (
        policy.get("artifactKind") != "sniptale-selectel-runner-policy"
        or policy.get("compute", {}).get("availabilityZone") != "ru-3a"
        or policy.get("compute", {}).get("preemptible") is not True
        or policy.get("runner", {}).get("maxJobs") != 1
    ):
        raise RuntimeError("Malformed Selectel runner policy.")
    return policy


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


def select_resources(connection, policy: dict[str, Any]) -> dict[str, Any]:
    compute = policy["compute"]
    selector = policy["imageSelector"]
    zone = compute["availabilityZone"]
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
        if item.vcpus == compute["vcpus"] and item.ram == compute["ramMiB"]
    ]
    if len(flavors) != 1:
        raise RuntimeError("Expected exactly one Selectel flavor for the canonical resource profile.")
    images = []
    for image in connection.image.images(status="active"):
        properties = image.to_dict()
        architecture = properties.get("architecture")
        if (
            image.name == selector["name"]
            and properties.get("os_distro") == selector["osDistro"]
            and properties.get("os_version") == selector["osVersion"]
            and architecture in selector["architectures"]
        ):
            images.append(image)
    images.sort(key=lambda item: str(item.created_at or ""), reverse=True)
    if not images:
        raise RuntimeError(f"No active {compute['operatingSystem']} amd64 image is available.")
    external = [item for item in connection.network.networks(is_router_external=True)]
    if len(external) != 1:
        raise RuntimeError("Expected exactly one Selectel external network.")
    volume_types = [item for item in connection.block_storage.types() if item.name == compute["bootVolumeType"]]
    if len(volume_types) != 1:
        raise RuntimeError("Configured Selectel boot volume type is unavailable.")
    return {
        "zone": zone,
        "flavor": flavors[0],
        "image": images[0],
        "external_network": external[0],
        "volume_type": volume_types[0],
    }


def ensure_static_network(connection, selected: dict[str, Any], policy: dict[str, Any]):
    network_policy = policy["network"]
    network = exact(
        connection.network.networks(name=network_policy["name"]),
        network_policy["name"],
        "network",
    )
    if network is None:
        network = connection.network.create_network(
            name=network_policy["name"], admin_state_up=True
        )
    subnet = exact(
        connection.network.subnets(name=network_policy["subnetName"]),
        network_policy["subnetName"],
        "subnet",
    )
    if subnet is None:
        subnet = connection.network.create_subnet(
            name=network_policy["subnetName"],
            network_id=network.id,
            cidr=network_policy["subnetCidr"],
            ip_version=4,
            enable_dhcp=True,
        )
    if subnet.network_id != network.id or subnet.cidr != network_policy["subnetCidr"]:
        raise RuntimeError("Existing Selectel managed subnet drifted from policy.")
    router = exact(
        connection.network.routers(name=network_policy["routerName"]),
        network_policy["routerName"],
        "router",
    )
    if router is None:
        router = connection.network.create_router(
            name=network_policy["routerName"],
            admin_state_up=True,
            external_gateway_info={"network_id": selected["external_network"].id},
        )
    if router.external_gateway_info.get("network_id") != selected["external_network"].id:
        raise RuntimeError("Existing Selectel managed router gateway drifted from policy.")
    router_ports = list(connection.network.ports(device_id=router.id))
    if not any(
        fixed.get("subnet_id") == subnet.id
        for port in router_ports
        for fixed in port.fixed_ips
    ):
        connection.network.add_interface_to_router(router, subnet=subnet.id)
    security_group = exact(
        connection.network.security_groups(name=network_policy["securityGroupName"]),
        network_policy["securityGroupName"],
        "security group",
    )
    if security_group is None:
        security_group = connection.network.create_security_group(
            name=network_policy["securityGroupName"],
            description="Sniptale disposable runner: egress only, no ingress",
        )
    if any(rule.get("direction") == "ingress" for rule in security_group.security_group_rules):
        raise RuntimeError("Selectel managed runner security group unexpectedly permits ingress.")
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
    image_user: str,
    image_token: str,
):
    if not image_reference.startswith("ghcr.io/lrozhkov/sniptale-qa@sha256:"):
        raise RuntimeError("Selectel runner requires an immutable QA image reference.")
    archive = policy["runner"]["archive"]
    runner_command = (
        "cd /opt/actions-runner && "
        "runuser -u runner -- ./run.sh --jitconfig \"$(cat /run/sniptale-jit)\"; "
        "status=$?; shred -u /run/sniptale-jit || rm -f /run/sniptale-jit; exit $status"
    )
    jit_install = (
        "install -m 600 /dev/null /run/sniptale-jit && "
        f"printf %s {shlex.quote(jit_config)} > /run/sniptale-jit"
    )
    registry_login = (
        "mkdir -p /run/sniptale-docker && "
        f"printf %s {shlex.quote(image_token)} | "
        f"docker --config /run/sniptale-docker login ghcr.io --username {shlex.quote(image_user)} "
        "--password-stdin"
    )
    registry_cleanup = (
        "docker --config /run/sniptale-docker logout ghcr.io >/dev/null 2>&1 || true; "
        "rm -rf /run/sniptale-docker"
    )
    cloud_scrub = (
        "shred -u /var/lib/cloud/instance/user-data.txt "
        "/var/lib/cloud/instance/scripts/runcmd 2>/dev/null || true"
    )
    source = f"""#cloud-config
package_update: true
packages: [ca-certificates, curl, docker.io, git, jq]
runcmd:
  - [systemctl, enable, --now, docker]
  - [useradd, --create-home, --shell, /bin/bash, runner]
  - [usermod, --append, --groups, docker, runner]
  - [mkdir, --parents, /opt/actions-runner]
  - [curl, --fail, --location, --silent, --show-error, --output, /tmp/{archive}, {policy['runner']['url']}]
  - [bash, -c, {json.dumps(f"echo '{policy['runner']['sha256']}  /tmp/{archive}' | sha256sum --check --strict")}]
  - [tar, --extract, --gzip, --file, /tmp/{archive}, --directory, /opt/actions-runner]
  - [chown, --recursive, runner:runner, /opt/actions-runner]
  - [bash, -c, {json.dumps(registry_login)}]
  - [docker, --config, /run/sniptale-docker, pull, {image_reference}]
  - [bash, -c, {json.dumps(registry_cleanup)}]
  - [bash, -c, {json.dumps(jit_install)}]
  - [bash, -c, {json.dumps(cloud_scrub)}]
  - [bash, -c, {json.dumps(runner_command)}]
"""
    return base64.b64encode(source.encode()).decode(), f"sha256:{hashlib.sha256(source.encode()).hexdigest()}"


def record_path(attempt: str) -> Path:
    return ROOT / f"build/selectel-controller/attempt-{attempt}.json"


def write_record(destination: Path, record: dict[str, Any]):
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


def cleanup(connection, policy: dict[str, Any], token: str, record: dict[str, Any]):
    result = {"runner": "absent", "server": "absent", "ports": "absent", "volumes": "absent"}
    if record.get("runnerId"):
        delete_runner(policy, token, record["runnerId"])
        result["runner"] = "deleted"
    if record.get("serverId"):
        server = connection.compute.find_server(record["serverId"], ignore_missing=True)
        if server is not None:
            connection.compute.delete_server(server, ignore_missing=True)
            connection.compute.wait_for_delete(server, interval=2, wait=120)
            result["server"] = "deleted"
    for port_id in record.get("portIds", []):
        connection.network.delete_port(port_id, ignore_missing=True)
        if connection.network.find_port(port_id, ignore_missing=True) is not None:
            raise RuntimeError("Selectel runner port survived cleanup.")
        result["ports"] = "deleted"
    for volume_id in record.get("volumeIds", []):
        volume = connection.block_storage.find_volume(volume_id, ignore_missing=True)
        if volume is not None:
            connection.block_storage.delete_volume(volume, ignore_missing=True)
            connection.block_storage.wait_for_delete(volume, interval=2, wait=120)
            result["volumes"] = "deleted"
    return result


def preflight(policy: dict[str, Any]):
    connection, _, project = connect(policy)
    selected = select_resources(connection, policy)
    proof = {
        "schemaVersion": 2,
        "artifactKind": "sniptale-selectel-connectivity-proof",
        "project": project,
        "region": policy["controllerEnvironment"]["expectedRegion"],
        "availabilityZone": selected["zone"],
        "image": {"id": selected["image"].id, "name": selected["image"].name},
        "flavor": {
            "id": selected["flavor"].id,
            "name": selected["flavor"].name,
            "vcpus": selected["flavor"].vcpus,
            "ramMiB": selected["flavor"].ram,
        },
        "externalNetwork": {
            "id": selected["external_network"].id,
            "name": selected["external_network"].name,
        },
        "volumeType": selected["volume_type"].name,
        "admission": "resource creation is authoritative; quotas are not inferred",
    }
    destination = ROOT / "build/selectel-controller/preflight.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(destination.relative_to(ROOT))


def provision(policy: dict[str, Any]):
    attempt = required(os.environ.get("SNIPTALE_ATTEMPT"), "SNIPTALE_ATTEMPT")
    if attempt not in {"1", "2", "3"}:
        raise RuntimeError("Invalid Selectel infrastructure attempt.")
    run_id = required(os.environ.get("GITHUB_RUN_ID"), "GITHUB_RUN_ID")
    candidate_sha = required(os.environ.get("SNIPTALE_CANDIDATE_SHA"), "SNIPTALE_CANDIDATE_SHA")
    image_reference = required(os.environ.get("SNIPTALE_QA_IMAGE"), "SNIPTALE_QA_IMAGE")
    image_user = required(os.environ.get("RUNNER_IMAGE_USER"), "RUNNER_IMAGE_USER")
    image_token = required(os.environ.get("RUNNER_IMAGE_TOKEN"), "RUNNER_IMAGE_TOKEN")
    token = required(os.environ.get("RUNNER_CONTROLLER_TOKEN"), "RUNNER_CONTROLLER_TOKEN")
    connection, _, project = connect(policy)
    selected = select_resources(connection, policy)
    network, subnet, security_group = ensure_static_network(connection, selected, policy)
    name = f"sniptale-{run_id}-{attempt}"
    label = f"{policy['runner']['labelPrefix']}{run_id}-{attempt}"
    if any(server.name == name for server in connection.compute.servers(name=name)):
        raise RuntimeError("Selectel runner server name collision.")
    runner_id, jit_config = create_jit_runner(policy, token, name, label)
    user_data, user_data_digest = cloud_init(
        policy, jit_config, image_reference, image_user, image_token
    )
    metadata = {
        "managed-by": policy["lifecycle"]["managedBy"],
        "repository": policy["repository"],
        "workflow": required(os.environ.get("GITHUB_WORKFLOW"), "GITHUB_WORKFLOW"),
        "run-id": run_id,
        "run-attempt": required(os.environ.get("GITHUB_RUN_ATTEMPT"), "GITHUB_RUN_ATTEMPT"),
        "candidate-sha": candidate_sha,
        "expires-at": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(time.time() + policy["lifecycle"]["ttlSeconds"]),
        ),
    }
    destination = record_path(attempt)
    if destination.exists():
        raise RuntimeError("Refusing Selectel controller record collision.")
    record = {
        "schemaVersion": 2,
        "artifactKind": "sniptale-selectel-attempt-record",
        "attempt": int(attempt),
        "runId": run_id,
        "candidateSha": candidate_sha,
        "project": project,
        "region": policy["controllerEnvironment"]["expectedRegion"],
        "availabilityZone": selected["zone"],
        "imageId": selected["image"].id,
        "flavorId": selected["flavor"].id,
        "qaImage": image_reference,
        "cloudInitDigest": user_data_digest,
        "resourceProfile": policy["resourceProfile"],
        "resources": {
            "vcpus": policy["compute"]["vcpus"],
            "ramMiB": policy["compute"]["ramMiB"],
            "bootVolumeGiB": policy["compute"]["bootVolumeGiB"],
        },
        "preemptible": False,
        "publicIp": False,
        "runnerId": runner_id,
        "runnerName": name,
        "runnerLabel": label,
        "serverId": None,
        "portIds": [],
        "volumeIds": [],
        "status": "provisioning",
        "cleanup": None,
    }
    write_record(destination, record)
    try:
        volume_name = f"{name}-boot"
        if list(connection.block_storage.volumes(name=volume_name)):
            raise RuntimeError("Selectel runner boot volume name collision.")
        volume = connection.block_storage.create_volume(
            name=volume_name,
            size=policy["compute"]["bootVolumeGiB"],
            image_id=selected["image"].id,
            volume_type=selected["volume_type"].name,
            availability_zone=selected["zone"],
            metadata=metadata,
        )
        record["volumeIds"] = [volume.id]
        write_record(destination, record)
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
            description=f"{policy['lifecycle']['managedBy']}:{run_id}:{attempt}",
        )
        record["portIds"] = [port.id]
        write_record(destination, record)
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
        write_record(destination, record)
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
        write_record(destination, record)
        print(json.dumps({"record": str(destination.relative_to(ROOT)), "label": label}))
    except Exception:
        record["status"] = "provision-failed"
        record["cleanup"] = cleanup(connection, policy, token, record)
        write_record(destination, record)
        raise


def cleanup_command(policy: dict[str, Any], record_file: str):
    destination = Path(record_file).resolve()
    record = json.loads(destination.read_text(encoding="utf-8"))
    if record.get("artifactKind") != "sniptale-selectel-attempt-record":
        raise RuntimeError("Malformed Selectel attempt record.")
    connection, _, _ = connect(policy)
    token = required(os.environ.get("RUNNER_CONTROLLER_TOKEN"), "RUNNER_CONTROLLER_TOKEN")
    record["cleanup"] = cleanup(connection, policy, token, record)
    record["status"] = "cleaned"
    write_record(destination, record)
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
    live_server_ids = {server.id for server in all_servers if server not in servers}
    ports = [
        port
        for port in connection.network.ports()
        if (port.description or "").startswith(f"{policy['lifecycle']['managedBy']}:")
        and (not port.device_id or port.device_id not in live_server_ids)
    ]
    for port in ports:
        connection.network.delete_port(port, ignore_missing=True)
        if connection.network.find_port(port.id, ignore_missing=True) is not None:
            raise RuntimeError("Expired Selectel runner port survived sweep cleanup.")
    runners = github_json(
        f"/repos/{policy['repository']}/actions/runners?per_page=100", token
    ).get("runners", [])
    offline = [
        runner
        for runner in runners
        if runner.get("name", "").startswith("sniptale-") and runner.get("status") == "offline"
    ]
    for runner in offline:
        delete_runner(policy, token, runner["id"])
    proof = {
        "schemaVersion": 2,
        "artifactKind": "sniptale-selectel-sweep-proof",
        "project": project,
        "region": policy["controllerEnvironment"]["expectedRegion"],
        "deleted": {
            "servers": [item.id for item in servers],
            "volumes": [item.id for item in volumes],
            "ports": [item.id for item in ports],
            "runners": [item["id"] for item in offline],
        },
    }
    destination = ROOT / "build/selectel-controller/sweep.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["preflight", "provision", "cleanup", "sweep"])
    parser.add_argument("record", nargs="?")
    arguments = parser.parse_args()
    policy = read_policy()
    if arguments.command == "preflight":
        preflight(policy)
    elif arguments.command == "provision":
        provision(policy)
    elif arguments.command == "cleanup":
        cleanup_command(policy, required(arguments.record, "attempt record"))
    else:
        sweep(policy)


if __name__ == "__main__":
    try:
        main()
    except (exceptions.SDKException, RuntimeError) as failure:
        print(f"Selectel controller failed: {failure}", file=sys.stderr)
        sys.exit(1)
