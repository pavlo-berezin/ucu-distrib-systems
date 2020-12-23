const pRetry = require('p-retry');
const health = require('grpc-health-check');
const { promisify } = require('util');

class RetryService {
  constructor(messages) {
    this.messages = messages;
  }

  checks = {};

  check(client) {
    if (!this.checks[client.url]) {
      const clientCheck = promisify(client.health.check.bind(client.health));

      this.checks[client.url] = pRetry(() => clientCheck(new health.messages.HealthCheckRequest()), {
        onFailedAttempt: error => {
          console.log(`[${client.url}] Attempt ${error.attemptNumber} failed.`);
        },
        maxTimeout: 60 * 1000,
        forever: true,
      }).then(async () => {
        console.log(`[${client.url}] Connected!`)
        const insertMany = promisify(client.messages.insertMany.bind(client.messages));

        let result = await insertMany(this.messages).catch(e => {
          this.check(client);
        });

        this.checks[client.url] = null;

        return result;
      })
    }

    return this.checks[client.url];
  }
}

module.exports = RetryService;