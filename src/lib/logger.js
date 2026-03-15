const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function serializeMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return meta;
  }

  if (meta instanceof Error) {
    return serializeError(meta);
  }

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (value instanceof Error) {
        return [key, serializeError(value)];
      }

      return [key, value];
    }),
  );
}

export function serializeError(error) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.status ? { status: error.status } : {}),
  };
}

export function createLogger({ level = "info", ...baseContext } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function log(logLevel, message, meta) {
    if ((LEVELS[logLevel] ?? LEVELS.info) < threshold) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level: logLevel,
      message,
      ...baseContext,
      ...(meta ? { meta: serializeMeta(meta) } : {}),
    };

    const output = JSON.stringify(payload);

    if (logLevel === "error") {
      console.error(output);
      return;
    }

    if (logLevel === "warn") {
      console.warn(output);
      return;
    }

    console.log(output);
  }

  return {
    child(extraContext = {}) {
      return createLogger({
        level,
        ...baseContext,
        ...extraContext,
      });
    },
    debug(message, meta) {
      log("debug", message, meta);
    },
    info(message, meta) {
      log("info", message, meta);
    },
    warn(message, meta) {
      log("warn", message, meta);
    },
    error(message, meta) {
      log("error", message, meta);
    },
  };
}
