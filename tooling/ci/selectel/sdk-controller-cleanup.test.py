#!/usr/bin/env python3
"""Deterministic failure proof for the Selectel cleanup owner."""

import json
import os
import runpy
import sys
import tempfile
import types


openstack = types.ModuleType("openstack")
openstack.connection = types.SimpleNamespace(Connection=object)
openstack.exceptions = types.SimpleNamespace(SDKException=Exception)
sys.modules["openstack"] = openstack
controller = runpy.run_path(
    "tooling/ci/selectel/sdk-controller.py", run_name="sniptale_test"
)


def runner_api_failure():
    events = []

    class Compute:
        def find_server(self, resource_id, ignore_missing=True):
            return object()

        def delete_server(self, resource, ignore_missing=True):
            events.append("server-delete")

        def wait_for_delete(self, resource, interval, wait):
            events.append("server-wait")

    class Network:
        def __init__(self):
            self.router_deleted = False
            self.subnet_deleted = False
            self.network_deleted = False
            self.security_group_deleted = False

        def delete_port(self, resource_id, ignore_missing=True):
            events.append("port-delete")

        def find_port(self, resource_id, ignore_missing=True):
            return None

        def find_security_group(self, resource_id, ignore_missing=True):
            return None if self.security_group_deleted else types.SimpleNamespace(id=resource_id)

        def delete_security_group(self, resource, ignore_missing=True):
            events.append("security-group-delete")
            self.security_group_deleted = True

        def find_router(self, resource_id, ignore_missing=True):
            return None if self.router_deleted else types.SimpleNamespace(id=resource_id)

        def find_subnet(self, resource_id, ignore_missing=True):
            return None if self.subnet_deleted else types.SimpleNamespace(id=resource_id)

        def remove_interface_from_router(self, router, subnet_id):
            events.append("router-interface-delete")

        def delete_router(self, resource, ignore_missing=True):
            events.append("router-delete")
            self.router_deleted = True

        def delete_subnet(self, resource, ignore_missing=True):
            events.append("subnet-delete")
            self.subnet_deleted = True

        def find_network(self, resource_id, ignore_missing=True):
            return None if self.network_deleted else types.SimpleNamespace(id=resource_id)

        def delete_network(self, resource, ignore_missing=True):
            events.append("network-delete")
            self.network_deleted = True

    class BlockStorage:
        def find_volume(self, resource_id, ignore_missing=True):
            return object()

        def delete_volume(self, resource, ignore_missing=True):
            events.append("volume-delete")

        def wait_for_delete(self, resource, interval, wait):
            events.append("volume-wait")

    connection = types.SimpleNamespace(
        compute=Compute(), network=Network(), block_storage=BlockStorage()
    )

    def fail_runner(policy, token, runner_id):
        raise RuntimeError("GitHub runner controller request failed with HTTP 403.")

    controller["cleanup"].__globals__["delete_runner"] = fail_runner
    record = {
        "runnerId": 1,
        "serverId": "server",
        "portIds": ["port"],
        "securityGroupId": "security-group",
        "routerPortIds": ["router-port"],
        "routerInterfacePortIds": ["router-port"],
        "routerId": "router",
        "subnetId": "subnet",
        "networkId": "network",
        "volumeIds": ["volume"],
    }
    try:
        controller["cleanup"](connection, {}, "token", record)
    except RuntimeError as failure:
        assert "runner" in str(failure)
    else:
        raise AssertionError("cleanup unexpectedly succeeded")
    assert events == [
        "server-delete",
        "server-wait",
        "port-delete",
        "security-group-delete",
        "router-interface-delete",
        "router-delete",
        "subnet-delete",
        "network-delete",
        "volume-delete",
        "volume-wait",
    ]
    assert record["cleanup"] == {
        "runner": "failed",
        "server": "deleted",
        "ports": "deleted",
        "securityGroups": "deleted",
        "routerPorts": "deleted",
        "router": "deleted",
        "subnet": "deleted",
        "network": "deleted",
        "volumes": "deleted",
    }
    print(json.dumps(record["cleanup"], sort_keys=True))


def receipt_failure():
    def fail_cleanup(policy, token, record, connection=None):
        record["cleanup"] = {
            "runner": "failed",
            "server": "absent",
            "ports": "absent",
            "volumes": "absent",
        }
        record["cleanupAttempts"] = 3
        record["cleanupFailure"] = {"kind": "RuntimeError", "message": "HTTP 403"}
        raise RuntimeError("cleanup failed")

    controller["cleanup_command"].__globals__["cleanup_with_retries"] = fail_cleanup
    record = {"artifactKind": "sniptale-selectel-provision-record", "status": "online"}
    with tempfile.NamedTemporaryFile(
        mode="w+", encoding="utf8", delete=False
    ) as destination:
        json.dump(record, destination)
        path = destination.name
    os.environ["RUNNER_CONTROLLER_TOKEN"] = "token"
    try:
        controller["cleanup_command"]({}, path)
    except RuntimeError:
        pass
    else:
        raise AssertionError("cleanup command unexpectedly succeeded")
    with open(path, encoding="utf8") as source:
        written = json.load(source)
    assert written["status"] == "cleanup-failed"
    assert written["cleanupAttempts"] == 3
    assert written["cleanup"]["runner"] == "failed"
    print(json.dumps(written, sort_keys=True))


def nested_receipt_replay():
    def pass_cleanup(policy, token, record, connection=None):
        assert record["serverId"] == "server"
        return {
            "runner": "deleted",
            "server": "deleted",
            "ports": "deleted",
            "volumes": "deleted",
        }, 1

    controller["cleanup_command"].__globals__["cleanup_with_retries"] = pass_cleanup
    record = {
        "artifactKind": "sniptale-selectel-provision-record",
        "status": "cleanup-failed",
        "attempts": [
            {
                "runnerId": 1,
                "serverId": "server",
                "portIds": ["port"],
                "volumeIds": ["volume"],
                "status": "cleanup-failed",
            }
        ],
    }
    with tempfile.NamedTemporaryFile(
        mode="w+", encoding="utf8", delete=False
    ) as destination:
        json.dump(record, destination)
        path = destination.name
    os.environ["RUNNER_CONTROLLER_TOKEN"] = "token"
    controller["cleanup_command"]({}, path)
    with open(path, encoding="utf8") as source:
        written = json.load(source)
    assert written["status"] == "cleaned"
    assert written["attempts"][0]["status"] == "cleaned"
    print(json.dumps(written, sort_keys=True))


def partial_provisioning_receipt_replay():
    cleaned = []

    def pass_cleanup(policy, token, record, connection=None):
        cleaned.append(record["serverId"])
        return {"server": "deleted"}, 1

    controller["cleanup_command"].__globals__["cleanup_with_retries"] = pass_cleanup
    records = (
        {
            "artifactKind": "sniptale-selectel-provision-record",
            "status": "provisioning",
            "serverId": "top-level-server",
        },
        {
            "artifactKind": "sniptale-selectel-provision-record",
            "status": "provision-failed",
            "attempts": [
                {
                    "status": "provisioning",
                    "serverId": "nested-server",
                    "portIds": [],
                    "volumeIds": [],
                }
            ],
        },
    )
    os.environ["RUNNER_CONTROLLER_TOKEN"] = "token"
    written = []
    for record in records:
        with tempfile.NamedTemporaryFile(
            mode="w+", encoding="utf8", delete=False
        ) as destination:
            json.dump(record, destination)
            path = destination.name
        controller["cleanup_command"]({}, path)
        with open(path, encoding="utf8") as source:
            written.append(json.load(source))
    assert cleaned == ["top-level-server", "nested-server"]
    assert [record["status"] for record in written] == ["cleaned", "cleaned"]
    assert written[1]["attempts"][0]["status"] == "cleaned"
    print(json.dumps({"cleaned": cleaned}, sort_keys=True))


def identity_recovery():
    deleted = []
    owned_metadata = {
        "managed-by": "sniptale-github-actions",
        "repository": "repo",
        "run-id": "42",
        "run-attempt": "3",
        "profile-index": "0",
    }
    owned_server = types.SimpleNamespace(id="owned-server", metadata=owned_metadata)
    foreign_server = types.SimpleNamespace(
        id="foreign-server", metadata={**owned_metadata, "managed-by": "foreign-controller"}
    )
    owned_volume = types.SimpleNamespace(id="owned-volume", metadata=owned_metadata)
    foreign_volume = types.SimpleNamespace(
        id="foreign-volume", metadata={**owned_metadata, "repository": "other/repository"}
    )
    owned_description = "sniptale-github-actions:repo:42:3:1:4102444800"
    foreign_description = "sniptale-github-actions:other/repository:42:3:1:4102444800"
    legacy_description = "sniptale-github-actions:42:3:1:4102444800"

    def resource(resource_id, description):
        return types.SimpleNamespace(id=resource_id, description=description)

    owned_port = resource("owned-port", owned_description)
    foreign_port = resource("foreign-port", foreign_description)
    legacy_port = resource("legacy-port", legacy_description)
    owned_router = resource("owned-router", owned_description)
    foreign_router = resource("foreign-router", foreign_description)
    owned_subnet = resource("owned-subnet", owned_description)
    foreign_subnet = resource("foreign-subnet", foreign_description)
    owned_network = resource("owned-network", owned_description)
    foreign_network = resource("foreign-network", foreign_description)
    owned_security_group = resource("owned-security-group", owned_description)
    foreign_security_group = resource("foreign-security-group", foreign_description)
    owned_router_port = types.SimpleNamespace(
        id="owned-router-port",
        description="",
        device_owner="network:router_interface",
        fixed_ips=[{"subnet_id": owned_subnet.id}],
    )

    class RecoveryCompute:
        def servers(self, details=True):
            return [owned_server, foreign_server]

        def find_server(self, resource_id, ignore_missing=True):
            return owned_server if resource_id == owned_server.id else None

        def delete_server(self, resource, ignore_missing=True):
            deleted.append(resource.id)

        def wait_for_delete(self, resource, interval=2, wait=120):
            return None

    class RecoveryBlockStorage:
        def volumes(self, details=True):
            return [owned_volume, foreign_volume]

        def find_volume(self, resource_id, ignore_missing=True):
            return owned_volume if resource_id == owned_volume.id else None

        def delete_volume(self, resource, ignore_missing=True):
            deleted.append(resource.id)

        def wait_for_delete(self, resource, interval=2, wait=120):
            return None

    class RecoveryNetwork:
        def ports(self, **kwargs):
            if kwargs.get("device_id") == owned_router.id:
                return [owned_router_port]
            return [owned_port, foreign_port, legacy_port]

        def routers(self):
            return [owned_router, foreign_router]

        def subnets(self):
            return [owned_subnet, foreign_subnet]

        def networks(self):
            return [owned_network, foreign_network]

        def security_groups(self):
            return [owned_security_group, foreign_security_group]

        def delete_port(self, resource_id, ignore_missing=True):
            deleted.append(resource_id)

        def find_port(self, resource_id, ignore_missing=True):
            return None

        def find_security_group(self, resource_id, ignore_missing=True):
            return (
                owned_security_group
                if resource_id == owned_security_group.id and resource_id not in deleted
                else None
            )

        def delete_security_group(self, resource, ignore_missing=True):
            deleted.append(resource.id)

        def find_router(self, resource_id, ignore_missing=True):
            return (
                owned_router
                if resource_id == owned_router.id and resource_id not in deleted
                else None
            )

        def find_subnet(self, resource_id, ignore_missing=True):
            return (
                owned_subnet
                if resource_id == owned_subnet.id and resource_id not in deleted
                else None
            )

        def remove_interface_from_router(self, router, subnet_id):
            deleted.append(owned_router_port.id)

        def delete_router(self, resource, ignore_missing=True):
            deleted.append(resource.id)

        def delete_subnet(self, resource, ignore_missing=True):
            deleted.append(resource.id)

        def find_network(self, resource_id, ignore_missing=True):
            return (
                owned_network
                if resource_id == owned_network.id and resource_id not in deleted
                else None
            )

        def delete_network(self, resource, ignore_missing=True):
            deleted.append(resource.id)

    connection = types.SimpleNamespace(
        compute=RecoveryCompute(), network=RecoveryNetwork(), block_storage=RecoveryBlockStorage()
    )
    controller["recover_cleanup"].__globals__["connect"] = lambda policy: (
        connection, "raw-project", "sha256:project"
    )
    controller["recover_cleanup"].__globals__["github_json"] = lambda *args, **kwargs: {
        "runners": [
            {"id": 17, "name": "sniptale-42-3-1", "status": "offline"},
            {"id": 18, "name": "sniptale-42-2-1", "status": "offline"},
        ]
    }
    controller["cleanup"].__globals__["delete_runner"] = (
        lambda policy, token, runner_id: deleted.append(runner_id)
    )
    os.environ.update(
        {"RUNNER_CONTROLLER_TOKEN": "token", "GITHUB_RUN_ID": "42", "GITHUB_RUN_ATTEMPT": "3"}
    )
    with tempfile.NamedTemporaryFile(delete=False) as destination:
        path = destination.name
    os.unlink(path)
    policy = {
        "lifecycle": {"managedBy": "sniptale-github-actions", "maxProfiles": 10},
        "repository": "repo",
        "controllerEnvironment": {"expectedRegion": "ru-3"},
    }
    controller["recover_cleanup"](policy, path)
    with open(path, encoding="utf8") as source:
        written = json.load(source)
    assert set(deleted) == {
        "owned-server",
        "owned-port",
        "owned-security-group",
        "owned-router-port",
        "owned-router",
        "owned-subnet",
        "owned-network",
        "owned-volume",
        17,
    }
    assert "foreign-server" not in json.dumps(written)
    assert "foreign-volume" not in json.dumps(written)
    for foreign_id in (
        "foreign-port",
        "legacy-port",
        "foreign-router",
        "foreign-subnet",
        "foreign-network",
        "foreign-security-group",
    ):
        assert foreign_id not in deleted
        assert foreign_id not in json.dumps(written)
    assert written["status"] == "cleaned"
    assert written["attempts"][0]["serverId"] == "owned-server"
    assert written["attempts"][0]["volumeIds"] == ["owned-volume"]
    assert written["attempts"][0]["runnerId"] == 17
    assert written["attempts"][0]["portIds"] == ["owned-port"]
    assert written["attempts"][0]["securityGroupId"] == "owned-security-group"
    assert written["attempts"][0]["routerId"] == "owned-router"
    assert written["attempts"][0]["subnetId"] == "owned-subnet"
    assert written["attempts"][0]["networkId"] == "owned-network"
    print(json.dumps(written, sort_keys=True))


def server_create_reconciliation():
    identity = {
        "managed-by": "sniptale-github-actions",
        "repository": "repo",
        "run-id": "42",
        "run-attempt": "3",
        "candidate-sha": "candidate",
        "profile-index": "0",
    }
    record = {
        "runnerName": "sniptale-42-3-1",
        "serverIdentity": identity,
        "serverId": None,
        "serverCreatePostAttempts": 1,
        "serverCreateOutcome": "pending",
    }

    def server(resource_id, metadata=None):
        return types.SimpleNamespace(
            id=resource_id,
            name=record["runnerName"],
            metadata=identity if metadata is None else metadata,
        )

    class Compute:
        def __init__(self, servers):
            self.matches = servers
            self.deleted = []

        def servers(self, name=None, details=True):
            assert name == record["runnerName"]
            assert details is True
            return self.matches

        def find_server(self, resource_id, ignore_missing=True):
            return next((item for item in self.matches if item.id == resource_id), None)

        def delete_server(self, resource, ignore_missing=True):
            self.deleted.append(resource.id)

        def wait_for_delete(self, resource, interval, wait):
            return None

    def connection(servers):
        return types.SimpleNamespace(
            compute=Compute(servers),
            network=types.SimpleNamespace(),
            block_storage=types.SimpleNamespace(),
        )

    policy = {"lifecycle": {"serverCreateReconciliation": {"attempts": 3, "intervalSeconds": 1}}}
    connections = iter((connection([]), connection([server("owned-server")])))
    globals_ = controller["reconcile_server_create"].__globals__
    globals_["connect"] = lambda unused_policy: (next(connections), "raw-project", "sha256:project")
    globals_["time"].sleep = lambda seconds: None
    reconciled, active_connection = controller["reconcile_server_create"](policy, record)
    assert reconciled.id == "owned-server"
    assert active_connection.compute.matches[0].id == "owned-server"

    empty_connection = connection([])
    globals_["connect"] = lambda unused_policy: (
        empty_connection,
        "raw-project",
        "sha256:project",
    )
    missing, active_connection = controller["reconcile_server_create"](policy, record)
    assert missing is None
    assert active_connection is empty_connection

    duplicate_connection = connection([server("owned-1"), server("owned-2")])
    globals_["connect"] = lambda unused_policy: (
        duplicate_connection,
        "raw-project",
        "sha256:project",
    )
    try:
        controller["reconcile_server_create"](policy, record)
    except RuntimeError as failure:
        assert "duplicate owned servers" in str(failure)
    else:
        raise AssertionError("duplicate owned servers were admitted")

    foreign_connection = connection(
        [server("foreign", {**identity, "managed-by": "foreign-controller"})]
    )
    globals_["connect"] = lambda unused_policy: (
        foreign_connection,
        "raw-project",
        "sha256:project",
    )
    try:
        controller["reconcile_server_create"](policy, record)
    except RuntimeError as failure:
        assert "foreign name collision" in str(failure)
    else:
        raise AssertionError("foreign server name collision was admitted")

    ambiguous_failure = type(
        "ConnectFailure",
        (Exception,),
        {"__module__": "keystoneauth1.exceptions.connection"},
    )("response lost")

    class CreateCompute:
        def __init__(self, failure):
            self.failure = failure
            self.create_calls = 0

        def create_server(self, **attributes):
            self.create_calls += 1
            assert attributes == {"name": record["runnerName"]}
            raise self.failure

    ambiguous_create = types.SimpleNamespace(compute=CreateCompute(ambiguous_failure))
    reconciliation_calls = []
    globals_["reconcile_server_create"] = lambda unused_policy, unused_record: (
        reconciliation_calls.append("read-only") or server("reconciled-server"),
        connection([server("reconciled-server")]),
    )
    created, _, outcome = controller["create_server_once"](
        policy, record, ambiguous_create, {"name": record["runnerName"]}
    )
    assert created.id == "reconciled-server"
    assert outcome == "reconciled"
    assert ambiguous_create.compute.create_calls == 1
    assert reconciliation_calls == ["read-only"]

    rejected_create = types.SimpleNamespace(compute=CreateCompute(RuntimeError("HTTP 400")))
    reconciliation_calls.clear()
    try:
        controller["create_server_once"](
            policy, record, rejected_create, {"name": record["runnerName"]}
        )
    except RuntimeError as failure:
        assert str(failure) == "HTTP 400"
    else:
        raise AssertionError("definitive Nova rejection was reinterpreted")
    assert rejected_create.compute.create_calls == 1
    assert reconciliation_calls == []

    unresolved_create = types.SimpleNamespace(compute=CreateCompute(ambiguous_failure))
    globals_["reconcile_server_create"] = lambda unused_policy, unused_record: (
        None,
        connection([]),
    )
    try:
        controller["create_server_once"](
            policy, record, unresolved_create, {"name": record["runnerName"]}
        )
    except controller["UnresolvedServerCreateFailure"]:
        pass
    else:
        raise AssertionError("unresolved Nova create was admitted")
    assert unresolved_create.compute.create_calls == 1

    failed_reconciliation_create = types.SimpleNamespace(
        compute=CreateCompute(ambiguous_failure)
    )

    def fail_reconciliation(unused_policy, unused_record):
        raise RuntimeError("read reconciliation failed")

    globals_["reconcile_server_create"] = fail_reconciliation
    try:
        controller["create_server_once"](
            policy,
            record,
            failed_reconciliation_create,
            {"name": record["runnerName"]},
        )
    except controller["UnresolvedServerCreateFailure"] as failure:
        assert "reconciliation failed" in str(failure)
        assert isinstance(failure.__cause__, RuntimeError)
        assert isinstance(failure.__cause__.__context__, type(ambiguous_failure))
    else:
        raise AssertionError("failed read reconciliation lost ambiguous mutation state")
    assert failed_reconciliation_create.compute.create_calls == 1

    cleanup_connection = connection([server("cleanup-server")])
    cleanup_record = {**record, "serverCreateOutcome": "unresolved"}
    result = controller["cleanup"](cleanup_connection, {}, "token", cleanup_record)
    assert cleanup_record["serverId"] == "cleanup-server"
    assert cleanup_record["serverCreateOutcome"] == "reconciled-for-cleanup"
    assert cleanup_connection.compute.deleted == ["cleanup-server"]
    assert result["server"] == "deleted"
    print(
        json.dumps(
            {
                "reconciled": reconciled.id,
                "missing": missing,
                "cleanup": cleanup_record["serverCreateOutcome"],
            },
            sort_keys=True,
        )
    )


if sys.argv[1:] == ["runner-api-failure"]:
    runner_api_failure()
elif sys.argv[1:] == ["receipt-failure"]:
    receipt_failure()
elif sys.argv[1:] == ["nested-receipt-replay"]:
    nested_receipt_replay()
elif sys.argv[1:] == ["partial-provisioning-receipt-replay"]:
    partial_provisioning_receipt_replay()
elif sys.argv[1:] == ["identity-recovery"]:
    identity_recovery()
elif sys.argv[1:] == ["server-create-reconciliation"]:
    server_create_reconciliation()
else:
    raise RuntimeError("Unknown cleanup proof case.")
