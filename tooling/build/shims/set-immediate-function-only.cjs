(function installFunctionOnlySetImmediate(globalObject) {
  if (typeof globalObject.setImmediate === 'function') {
    return;
  }

  var nextHandle = 1;
  var tasksByHandle = Object.create(null);

  globalObject.setImmediate = function setImmediate(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('setImmediate callback must be a function.');
    }

    var handle = nextHandle++;
    var args = Array.prototype.slice.call(arguments, 1);
    tasksByHandle[handle] = { args: args, callback: callback };
    globalObject.setTimeout(function runImmediateTask() {
      var task = tasksByHandle[handle];
      if (!task) {
        return;
      }
      delete tasksByHandle[handle];
      task.callback.apply(undefined, task.args);
    }, 0);
    return handle;
  };

  globalObject.clearImmediate = function clearImmediate(handle) {
    delete tasksByHandle[handle];
  };
})(globalThis);
