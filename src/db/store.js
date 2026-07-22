function createStore(env) {
  const mysqlReady = env.MYSQL_HOST && env.MYSQL_USER && env.MYSQL_DATABASE;
  if (!mysqlReady) return memoryStore();
  try {
    const mysql = require("mysql2/promise");
    const pool = mysql.createPool({
      host: env.MYSQL_HOST,
      port: Number(env.MYSQL_PORT || 3306),
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD || "",
      database: env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 4
    });
    return mysqlStore(pool);
  } catch (error) {
    const store = memoryStore();
    store.warning = `mysql2 is not installed or MySQL is unavailable: ${error.message}`;
    return store;
  }
}

function memoryStore() {
  const runs = new Map();
  return {
    kind: "memory",
    async saveRun(result) {
      runs.set(result.runId, result);
    },
    async getRun(runId) {
      return runs.get(runId);
    }
  };
}

function mysqlStore(pool) {
  return {
    kind: "mysql",
    async saveRun(result) {
      await pool.execute(
        "INSERT INTO analysis_runs (id, app_url, goal, model_provider, model_name, used_model, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json)",
        [result.runId, result.appUrl, result.goal, result.model.provider, result.model.model, result.model.usedModel ? 1 : 0, JSON.stringify(result)]
      );
      for (const review of result.cleanedReviews) {
        await pool.execute(
          "INSERT INTO reviews (id, run_id, title, content, rating, app_version, author, updated_at_text, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)",
          [review.id, result.runId, review.title, review.content, review.rating, review.version, review.author, review.updatedAt, review.source]
        );
      }
    },
    async getRun(runId) {
      const [rows] = await pool.execute("SELECT payload_json FROM analysis_runs WHERE id = ?", [runId]);
      return rows[0] ? JSON.parse(rows[0].payload_json) : null;
    }
  };
}

module.exports = { createStore };
