module.exports = {
  rabbitmq: {
    url: 'amqp://localhost',
    exchange: {
      name: 'user.actions',
      type: 'fanout',
      options: {
        durable: true  // Exchange survives broker restart
      }
    },
    queues: {
      analytics: 'analytics.queue',
      notification: 'notification.queue',
      audit: 'audit.queue',
      cache: 'cache.invalidation.queue'
    }
  }
};
