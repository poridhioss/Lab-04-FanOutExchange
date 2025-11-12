const amqp = require('amqplib');
const config = require('./config');

class ActionPublisher {
  constructor() {
    this.connection = null;
    this.channel = null;
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    // Ensure exchange exists
    await this.channel.assertExchange(
      config.rabbitmq.exchange.name,
      config.rabbitmq.exchange.type,
      config.rabbitmq.exchange.options
    );
    
    console.log('📡 Publisher connected to RabbitMQ');
  }
  
  async publishAction(action, userId, data = {}) {
    const message = {
      action,
      userId,
      timestamp: new Date().toISOString(),
      data
    };
    
    // Publish to fanout exchange
    // Routing key is ignored, but we pass empty string
    this.channel.publish(
      config.rabbitmq.exchange.name,
      '', // Routing key (ignored in fanout)
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true, // Message survives broker restart
        contentType: 'application/json'
      }
    );
    
    console.log(`Published: ${action} for user ${userId}`);
    return message;
  }
  
  async close() {
    await this.channel.close();
    await this.connection.close();
  }
}

// Example usage
async function main() {
  const publisher = new ActionPublisher();
  
  try {
    await publisher.connect();
    
    // Simulate different user actions
    console.log('\Publishing user actions...\n');
    
    // Action 1: User Login
    await publisher.publishAction('login', 'user123', {
      ipAddress: '192.168.1.1',
      device: 'Chrome Browser'
    });
    
    await sleep(1000);
    
    // Action 2: Purchase
    await publisher.publishAction('purchase', 'user456', {
      productId: 'PROD-789',
      amount: 99.99,
      currency: 'USD'
    });
    
    await sleep(1000);
    
    // Action 3: Profile Update
    await publisher.publishAction('profile_update', 'user123', {
      field: 'email',
      oldValue: 'old@example.com',
      newValue: 'new@example.com'
    });
    
    console.log('\nAll actions published!\n');
    
    // Keep process alive for a moment
    await sleep(2000);
    await publisher.close();
    
  } catch (error) {
    console.error('Publisher error:', error.message);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = ActionPublisher;
