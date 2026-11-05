import Database from 'better-sqlite3';
import { config as loadEnv } from 'dotenv';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const path = process.env.DATABASE_PATH ? resolve(process.env.DATABASE_PATH) : fileURLToPath(new URL('./data/shadow_market.db', import.meta.url));
mkdirSync(dirname(path), { recursive: true });
const db = new Database(path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const schema = [
 'CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 100000 CHECK(balance>=0), created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
 'CREATE TABLE IF NOT EXISTS inventory(player_id INTEGER NOT NULL REFERENCES players(id), item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0), avg_cost INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(player_id,item_id))',
 'CREATE TABLE IF NOT EXISTS market_prices(item_id TEXT PRIMARY KEY,item_name TEXT NOT NULL,category TEXT NOT NULL,symbol TEXT NOT NULL,price INTEGER NOT NULL,previous INTEGER NOT NULL,base_price INTEGER NOT NULL,supply INTEGER DEFAULT 1000,demand INTEGER DEFAULT 100,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
 'CREATE TABLE IF NOT EXISTS price_history(id INTEGER PRIMARY KEY,item_id TEXT NOT NULL,price INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
 'CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY,player_id INTEGER NOT NULL,item_id TEXT NOT NULL,quantity INTEGER NOT NULL,side TEXT NOT NULL,price INTEGER NOT NULL,total INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
 'CREATE TABLE IF NOT EXISTS shops(player_id INTEGER PRIMARY KEY REFERENCES players(id),level INTEGER NOT NULL DEFAULT 1)',
 'CREATE TABLE IF NOT EXISTS auctions(id INTEGER PRIMARY KEY,seller_id INTEGER NOT NULL,item_id TEXT NOT NULL,quantity INTEGER NOT NULL,start_bid INTEGER NOT NULL,bid INTEGER NOT NULL DEFAULT 0,bidder_id INTEGER,ends_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT "active")',
 'CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY,player_id INTEGER NOT NULL REFERENCES players(id),message TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
 'CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,description TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)'
];
db.exec(schema.join(';') + ';');
export const ITEMS = [
 ['graphics-card','Graphics Card','TECH','◈',30000],
 ['luxury-watch','Luxury Watch','LUXURY','◉',50000],
 ['rare-collectible','Rare Collectible','COLLECTIBLE','✦',20000],
 ['mysterious-cargo','Mysterious Cargo','CARGO','⬡',15000],
 ['gold-bar','Gold Bar','PRECIOUS','◆',100000],
 ['smartphone','Smartphone','TECH','▣',60000],
 ['vintage-art','Vintage Art','ART','✳',80000]
];
const add = db.prepare('INSERT OR IGNORE INTO market_prices(item_id,item_name,category,symbol,price,previous,base_price) VALUES(?,?,?,?,?,?,?)');
for (const item of ITEMS) {
 add.run(item[0],item[1],item[2],item[3],item[4],item[4],item[4]);
 if (!db.prepare('SELECT id FROM price_history WHERE item_id=? LIMIT 1').get(item[0])) db.prepare('INSERT INTO price_history(item_id,price) VALUES(?,?)').run(item[0],item[4]);
}
export default db;
