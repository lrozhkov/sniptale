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
        def delete_port(self, resource_id, ignore_missing=True):
            events.append("port-delete")

        def find_port(self, resource_id, ignore_missing=True):
            return None

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
        "volume-delete",
        "volume-wait",
    ]
    assert record["cleanup"] == {
        "runner": "failed",
        "server": "deleted",
        "ports": "deleted",
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


if sys.argv[1:] == ["runner-api-failure"]:
    runner_api_failure()
elif sys.argv[1:] == ["receipt-failure"]:
    receipt_failure()
else:
    raise RuntimeError("Unknown cleanup proof case.")
