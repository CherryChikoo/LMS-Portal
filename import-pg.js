const fs = require('fs');
const { Client } = require('pg');
const crypto = require('crypto');

const mem_cost = 14;
const rounds = 8;
const ss = 'Bw==';
const sk = '4QL4o52VE5vS9WtUSIDXB9p8IuCmY04/V7VLoL8RmP4H95JIPRTp+gCPCsX2n8ycYRKgIsPnOIKzi3HfiuC3KA==';

function base64UrlToBase64(str) {
  if (!str) return str;
  return str.replace(/-/g, '+').replace(/_/g, '/');
}

async function run() {
  const data = JSON.parse(fs.readFileSync('./firebase_users.json', 'utf8'));
  const users = data.users || data;

  const client = new Client({
    connectionString: 'postgresql://postgres:LMSPortal%40Colleges@db.rramkmudzrxaipukueuq.supabase.co:5432/postgres'
  });
  
  await client.connect();
  console.log(`Connected to Postgres. Processing ${users.length} users...`);

  let count = 0;
  for (const user of users) {
    const uid = user.localId;
    const email = user.email;
    const createdAt = user.createdAt ? new Date(parseInt(user.createdAt)).toISOString() : new Date().toISOString();
    
    // Fix padding and character set for base64
    const b64Hash = base64UrlToBase64(user.passwordHash);
    const b64Salt = base64UrlToBase64(user.salt);
    
    let encrypted_password = '';
    if (b64Hash && b64Salt) {
      encrypted_password = `$fbscrypt$v=1,n=${mem_cost},r=${rounds},p=1,ss=${ss},sk=${sk}$${b64Salt}$${b64Hash}`;
    }

    const appMetaData = JSON.stringify({ provider: "email", providers: ["email"] });
    const userMetaData = JSON.stringify({ 
      full_name: user.displayName || '',
      firebase_id: uid 
    });
    
    // Deterministically generate a UUID from the firebase UID so it is stable on reruns
    const md5hash = crypto.createHash('md5').update(uid).digest('hex');
    const userUuid = [
      md5hash.substring(0, 8),
      md5hash.substring(8, 12),
      md5hash.substring(12, 16),
      md5hash.substring(16, 20),
      md5hash.substring(20, 32)
    ].join('-');
    
    const query = `
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        is_super_admin
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        $1,
        'authenticated',
        'authenticated',
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $7,
        false
      ) ON CONFLICT (id) DO NOTHING;
    `;
    
    try {
      await client.query(query, [
        userUuid, // id
        email, // email
        encrypted_password, // encrypted_password
        user.emailVerified ? new Date().toISOString() : null, // email_confirmed_at
        appMetaData, // raw_app_meta_data
        userMetaData, // raw_user_meta_data
        createdAt // created_at
      ]);
      count++;
      if (count % 100 === 0) console.log(`Imported ${count} users...`);
    } catch (e) {
      console.error(`Failed to import user ${email}: ${e.message}`);
    }
  }

  console.log(`Successfully imported ${count} users.`);
  await client.end();
}

run().catch(console.error);
