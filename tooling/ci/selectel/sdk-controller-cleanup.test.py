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

        def delete_port(self, resource_id, ignore_missing=True):
            events.append("port-delete")

        def find_port(self, resource_id, ignore_missing=True):
            return None

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


if sys.argv[1:] == ["runner-api-failure"]:
    runner_api_failure()
elif sys.argv[1:] == ["receipt-failure"]:
    receipt_failure()
elif sys.argv[1:] == ["nested-receipt-replay"]:
    nested_receipt_replay()
else:
    raise RuntimeError("Unknown cleanup proof case.")
