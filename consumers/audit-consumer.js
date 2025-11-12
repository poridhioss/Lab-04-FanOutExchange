const amqp = require('amqplib');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

class AuditConsumer {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.logFile = path.join(__dirname, '../audit-log.json');
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    await this.channel.assertQueue(config.rabbitmq.queues.audit, {
      durable: true
    });
    
    console.log('📝 Audit Consumer connected');
  }
  
  async consume() {
    console.log('📝 Waiting for actions to audit log...\n');
    
    this.channel.consume(
      config.rabbitmq.queues.audit,
      async (msg) => {
        if (msg !== null) {
          const action = JSON.parse(msg.content.toString());
          await this.logAction(action);
          this.channel.ack(msg);
        }
      },
      { noAck: false }
    );
  }
  
  async logAction(action) {
    console.log(`📝 [AUDIT] Logging: ${action.action}`);
    
    const auditEntry = {
      logId: this.generateLogId(),
      action: action.action,
      userId: action.userId,
      timestamp: action.timestamp,
      data: action.data,
      compliance: this.getComplianceFlags(action)
    };
    
    // Simulate writing to audit log
    console.log(`   📄 Audit Entry:`, auditEntry);
    console.log(`   💾 Stored to audit database`);
    console.log(`   ✅ Compliance: ${auditEntry.compliance.join(', ')}`);
    
    // Actually write to file (optional)
    await this.writeToFile(auditEntry);
    console.log('');
  }
  
  generateLogId() {
    return `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getComplianceFlags(action) {
    const flags = ['LOGGED'];
    
    if (action.action === 'purchase') {
      flags.push('FINANCIAL_RECORD');
    }
    if (action.action === 'profile_update') {
      flags.push('PII_CHANGE', 'GDPR');
    }
    if (action.action === 'login') {
      flags.push('SECURITY_EVENT');
    }
    
    return flags;
  }
  
  async writeToFile(entry) {
    try {
      let logs = [];
      try {
        const data = await fs.readFile(this.logFile, 'utf8');
        logs = JSON.parse(data);
      } catch (err) {
        // File doesn't exist, start fresh
      }
      
      logs.push(entry);
      await fs.writeFile(this.logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('   ⚠️  Failed to write to audit log file:', error.message);
    }
  }
}

async function main() {
  const consumer = new AuditConsumer();
  
  try {
    await consumer.connect();
    await consumer.consume();
  } catch (error) {
    console.error('❌ Audit consumer error:', error.message);
    process.exit(1);
  }
}

main();
