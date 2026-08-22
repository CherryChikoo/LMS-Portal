const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.rramkmudzrxaipukueuq:LMSPortal%40admin@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function main() {
  const adminRes = await pool.query("SELECT u.email FROM users u JOIN user_roles r ON u.id = r.user_id WHERE r.role = 'main_admin' LIMIT 1;");
  const collegeAdminRes = await pool.query("SELECT u.email FROM users u JOIN user_roles r ON u.id = r.user_id WHERE r.role = 'college_admin' LIMIT 1;");
  const studentRes = await pool.query("SELECT u.email FROM users u JOIN user_roles r ON u.id = r.user_id WHERE r.role = 'student' LIMIT 1;");
  
  console.log('Global Admin Email:', adminRes.rows[0]?.email);
  console.log('College Admin Email:', collegeAdminRes.rows[0]?.email);
  console.log('Student Email:', studentRes.rows[0]?.email);
  
  pool.end();
}

main().catch(console.error);
