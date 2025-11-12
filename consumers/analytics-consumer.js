const amqp = require('amqplib');
const config = require('../config');

class AnalyticsConsumer {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.stats = {
      login: 0,
      purchase: 0,
      profile_update: 0,
      total: 0
    };
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    // Ensure queue exists
    await this.channel.assertQueue(config.rabbitmq.queues.analytics, {
      durable: true
    });
    
    console.log('Analytics Consumer connected');
  }
  
  async consume() {
    console.log('Waiting for user actions to analyze...\n');
    
    this.channel.consume(
      config.rabbitmq.queues.analytics,
      (msg) => {
        if (msg !== null) {
          const action = JSON.parse(msg.content.toString());
          this.processAction(action);
          
          // Acknowledge message
          this.channel.ack(msg);
        }
      },
      { noAck: false }
    );
  }
  
  processAction(action) {
    console.log(`[ANALYTICS] Processing: ${action.action}`);
    
    // Update statistics
    if (this.stats.hasOwnProperty(action.action)) {
      this.stats[action.action]++;
    }
    this.stats.total++;
    
    // Simulate analytics processing
    console.log(`   User: ${action.userId}`);
    console.log(`   Time: ${action.timestamp}`);
    console.log(`   Data:`, action.data);
    
    // Show current stats
    console.log(`   Current Stats:`, this.stats);
    console.log('');
  }
}

// Start consumer
async function main() {
  const consumer = new AnalyticsConsumer();
  
  try {
    await consumer.connect();
    await consumer.consume();
  } catch (error) {
    console.error('Analytics consumer error:', error.message);
    process.exit(1);
  }
}

main();
