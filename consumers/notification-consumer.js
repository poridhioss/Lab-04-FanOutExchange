const amqp = require('amqplib');
const config = require('../config');

class NotificationConsumer {
  constructor() {
    this.connection = null;
    this.channel = null;
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    await this.channel.assertQueue(config.rabbitmq.queues.notification, {
      durable: true
    });
    
    console.log('📧 Notification Consumer connected');
  }
  
  async consume() {
    console.log('📧 Waiting for actions to send notifications...\n');
    
    this.channel.consume(
      config.rabbitmq.queues.notification,
      (msg) => {
        if (msg !== null) {
          const action = JSON.parse(msg.content.toString());
          this.sendNotifications(action);
          this.channel.ack(msg);
        }
      },
      { noAck: false }
    );
  }
  
  sendNotifications(action) {
    console.log(`📧 [NOTIFICATION] Processing: ${action.action}`);
    
    // Determine notification type based on action
    switch (action.action) {
      case 'login':
        this.sendLoginAlert(action);
        break;
      case 'purchase':
        this.sendPurchaseConfirmation(action);
        break;
      case 'profile_update':
        this.sendProfileChangeNotification(action);
        break;
      default:
        console.log(`   ℹ️  No notification configured for: ${action.action}`);
    }
    console.log('');
  }
  
  sendLoginAlert(action) {
    console.log(`   📧 Sending login alert email to user ${action.userId}`);
    console.log(`   📱 Sending push notification: "New login from ${action.data.device}"`);
  }
  
  sendPurchaseConfirmation(action) {
    console.log(`   📧 Sending purchase confirmation email`);
    console.log(`   💰 Order: ${action.data.productId} - $${action.data.amount}`);
    console.log(`   📲 SMS: "Your order has been confirmed!"`);
  }
  
  sendProfileChangeNotification(action) {
    console.log(`   📧 Email: "Your ${action.data.field} has been updated"`);
    console.log(`   🔔 Security alert sent`);
  }
}

async function main() {
  const consumer = new NotificationConsumer();
  
  try {
    await consumer.connect();
    await consumer.consume();
  } catch (error) {
    console.error('❌ Notification consumer error:', error.message);
    process.exit(1);
  }
}

main();
