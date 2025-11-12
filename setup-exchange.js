const amqp = require('amqplib');
const config = require('./config');

async function setupExchange() {
  let connection;
  
  try {
    // Connect to RabbitMQ
    connection = await amqp.connect(config.rabbitmq.url);
    const channel = await connection.createChannel();
    
    console.log('🔧 Setting up Fanout Exchange...\n');
    
    // 1. Create Fanout Exchange
    await channel.assertExchange(
      config.rabbitmq.exchange.name,
      config.rabbitmq.exchange.type,
      config.rabbitmq.exchange.options
    );
    console.log(`✅ Exchange created: ${config.rabbitmq.exchange.name} (fanout)`);
    
    // 2. Create and Bind Queues
    const queues = Object.values(config.rabbitmq.queues);
    
    for (const queue of queues) {
      // Create queue
      await channel.assertQueue(queue, { durable: true });
      console.log(`✅ Queue created: ${queue}`);
      
      // Bind queue to fanout exchange
      // Note: Routing key is ignored in fanout, but we pass empty string
      await channel.bindQueue(
        queue,
        config.rabbitmq.exchange.name,
        '' // Routing key ignored in fanout
      );
      console.log(`🔗 Queue bound: ${queue} -> ${config.rabbitmq.exchange.name}`);
    }
    
    console.log('\n✨ Setup complete! All queues bound to fanout exchange.');
    console.log('📢 Any message published to this exchange will broadcast to ALL queues.\n');
    
    await channel.close();
    await connection.close();
    
  } catch (error) {
    console.error('❌ Setup error:', error.message);
    process.exit(1);
  }
}

setupExchange();
