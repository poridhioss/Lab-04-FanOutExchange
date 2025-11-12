const ActionPublisher = require('./action-publisher');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSystem() {
  console.log('🧪 TESTING FANOUT EXCHANGE SYSTEM\n');
  console.log('Make sure all consumers are running in separate terminals:');
  console.log('  Terminal 1: npm run analytics');
  console.log('  Terminal 2: npm run notification');
  console.log('  Terminal 3: npm run audit');
  console.log('  Terminal 4: npm run cache\n');
  console.log('Press Ctrl+C to stop after viewing results.\n');
  console.log('─'.repeat(60));
  
  const publisher = new ActionPublisher();
  
  try {
    await publisher.connect();
    await sleep(2000);
    
    // Test 1: Login Action
    console.log('\n🧪 TEST 1: User Login');
    await publisher.publishAction('login', 'alice123', {
      ipAddress: '192.168.1.100',
      device: 'iPhone Safari'
    });
    console.log('✅ Expected: All 4 consumers should process this message');
    await sleep(3000);
    
    // Test 2: Purchase Action
    console.log('\n🧪 TEST 2: User Purchase');
    await publisher.publishAction('purchase', 'bob456', {
      productId: 'LAPTOP-001',
      amount: 1299.99,
      currency: 'USD'
    });
    console.log('✅ Expected: All 4 consumers should process this message');
    await sleep(3000);
    
    // Test 3: Profile Update
    console.log('\n🧪 TEST 3: Profile Update');
    await publisher.publishAction('profile_update', 'alice123', {
      field: 'phoneNumber',
      oldValue: '+1-555-0100',
      newValue: '+1-555-0200'
    });
    console.log('✅ Expected: All 4 consumers should process this message');
    await sleep(3000);
    
    // Test 4: Multiple rapid actions
    console.log('\n🧪 TEST 4: Rapid Multiple Actions');
    for (let i = 0; i < 5; i++) {
      await publisher.publishAction('login', `user${i}`, {
        ipAddress: `192.168.1.${i}`,
        device: 'Chrome Browser'
      });
      await sleep(500);
    }
    console.log('✅ Expected: All consumers process all 5 messages');
    await sleep(3000);
    
    console.log('\n' + '─'.repeat(60));
    console.log('🎉 TEST COMPLETE!\n');
    console.log('Check each consumer terminal to verify:');
    console.log('  1. Analytics: Shows statistics');
    console.log('  2. Notification: Shows notification types');
    console.log('  3. Audit: Shows compliance flags');
    console.log('  4. Cache: Shows invalidation actions\n');
    
    await publisher.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    process.exit(1);
  }
}

testSystem();
