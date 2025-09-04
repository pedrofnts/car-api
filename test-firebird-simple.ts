#!/usr/bin/env tsx

import Firebird from 'node-firebird';

const options = {
  host: '177.69.206.233',
  port: 3050,
  database: '/tecnicon/varejao/ecommerce/dados/ecommerce.fdb',
  user: 'SYSDBA',
  password: 'ecovarej17052021',
  lowercase_keys: true,
  role: null,
  pageSize: 4096
};

console.log('🔥 Testing direct Firebird connection...');
console.log('Connection config:', {
  host: options.host,
  port: options.port,
  database: options.database,
  user: options.user
});

const timeout = setTimeout(() => {
  console.error('❌ Connection timeout (30s)');
  process.exit(1);
}, 30000);

Firebird.attach(options, (err, db) => {
  clearTimeout(timeout);
  
  if (err) {
    console.error('❌ Connection failed:', err.message);
    console.error('Error details:', {
      code: err.gdscode,
      sqlcode: err.sqlcode,
      message: err.message
    });
    process.exit(1);
  }

  console.log('✅ Connected successfully!');
  
  db.query('SELECT 1 as test FROM RDB$DATABASE', (queryErr, result) => {
    if (queryErr) {
      console.error('❌ Query failed:', queryErr.message);
      db.detach();
      process.exit(1);
    }
    
    console.log('✅ Query successful:', result);
    
    // List some tables
    db.query(`
      SELECT RDB$RELATION_NAME as table_name
      FROM RDB$RELATIONS 
      WHERE RDB$VIEW_BLR IS NULL 
        AND RDB$SYSTEM_FLAG = 0 
      ORDER BY RDB$RELATION_NAME 
      ROWS 10
    `, (tablesErr, tables) => {
      if (tablesErr) {
        console.error('❌ Tables query failed:', tablesErr.message);
      } else {
        console.log('✅ Found tables:', tables?.map((t: any) => t.table_name?.trim()));
      }
      
      db.detach((detachErr) => {
        if (detachErr) {
          console.error('❌ Detach failed:', detachErr.message);
        } else {
          console.log('✅ Connection closed successfully');
        }
        process.exit(0);
      });
    });
  });
});