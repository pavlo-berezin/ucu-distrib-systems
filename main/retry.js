const pRetry = require('p-retry');
const health = require('grpc-health-check');
const { promisify } = require('util');

class RetryService {
  constructor(messages) {
    this.messages = messages;
  }

  statuses = {}
  queues = {}

  check(client) {
    if (!this.statuses[client.url]) {
      this.statuses[client.url] = true;

      const clientCheck = promisify(client.health.check.bind(client.health));

      pRetry(() => clientCheck(new health.messages.HealthCheckRequest()), {
        onFailedAttempt: error => {
          console.log(`[${client.url}] Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
        },
        retries: 10
      }).then(async () => {
        console.log(`[${client.url}] Connected!`)
        const insertMany = promisify(client.messages.insertMany.bind(client.messages));

        insertMany(this.messages).catch(e => {
          this.check(client);
        })

        this.statuses[client.url] = false;
      })
    }
  }


}

module.exports = RetryService;