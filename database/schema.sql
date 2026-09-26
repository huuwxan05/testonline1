CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','pending')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 1000000 CHECK (balance >= 0),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(16) NOT NULL CHECK (type IN ('initial','bonus','bet','win','quest','adjustment','refund')),
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reference_type VARCHAR(40) NULL,
  reference_id BIGINT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_date ON wallet_transactions(user_id,created_at);

CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  category VARCHAR(40) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','disabled')),
  min_bet BIGINT NOT NULL DEFAULT 1000,
  max_bet BIGINT NOT NULL DEFAULT 10000000,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS game_rounds (
  id BIGSERIAL PRIMARY KEY,
  game_id INT NOT NULL REFERENCES games(id),
  round_no VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','settled','cancelled')),
  opens_at TIMESTAMP NOT NULL,
  locks_at TIMESTAMP NULL,
  settles_at TIMESTAMP NULL,
  result_json JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_round_game_status ON game_rounds(game_id,status);

CREATE TABLE IF NOT EXISTS bets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INT NOT NULL REFERENCES games(id),
  round_id BIGINT NULL REFERENCES game_rounds(id) ON DELETE SET NULL,
  selection VARCHAR(80) NOT NULL,
  stake BIGINT NOT NULL CHECK (stake > 0),
  payout BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','won','lost','refunded','cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS idx_bets_user_date ON bets(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);

CREATE TABLE IF NOT EXISTS game_results (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT NOT NULL UNIQUE REFERENCES game_rounds(id) ON DELETE CASCADE,
  result_json JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rounds_today INT NOT NULL DEFAULT 0,
  wins_today INT NOT NULL DEFAULT 0,
  losses_today INT NOT NULL DEFAULT 0,
  pnl_today BIGINT NOT NULL DEFAULT 0,
  total_rounds BIGINT NOT NULL DEFAULT 0,
  total_wins BIGINT NOT NULL DEFAULT 0,
  total_losses BIGINT NOT NULL DEFAULT 0,
  current_streak INT NOT NULL DEFAULT 0,
  max_streak INT NOT NULL DEFAULT 0,
  wagered_total BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vip_tiers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(40) NOT NULL,
  icon VARCHAR(16) NOT NULL,
  min_balance BIGINT NOT NULL,
  bonus_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  cashback_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_bet BIGINT NOT NULL,
  support_level VARCHAR(40) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'))
);

CREATE TABLE IF NOT EXISTS quests (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(16) NOT NULL,
  metric VARCHAR(16) NOT NULL CHECK (metric IN ('rounds','wins','wagered','streak','games')),
  target BIGINT NOT NULL,
  reward BIGINT NOT NULL,
  reset_hours INT NOT NULL DEFAULT 24,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'))
);

CREATE TABLE IF NOT EXISTS user_quests (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id INT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  progress BIGINT NOT NULL DEFAULT 0,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  reset_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,quest_id)
);

CREATE TABLE IF NOT EXISTS user_game_stats (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INT NOT NULL REFERENCES games(id),
  rounds BIGINT NOT NULL DEFAULT 0,
  wins BIGINT NOT NULL DEFAULT 0,
  losses BIGINT NOT NULL DEFAULT 0,
  wagered BIGINT NOT NULL DEFAULT 0,
  pnl BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,game_id)
);

CREATE TABLE IF NOT EXISTS sports_matches (
  id BIGSERIAL PRIMARY KEY,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished','cancelled')),
  odds_json JSONB NOT NULL,
  result VARCHAR(20) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lottery_draws (
  id BIGSERIAL PRIMARY KEY,
  draw_code VARCHAR(64) NOT NULL UNIQUE,
  draw_at TIMESTAMP NOT NULL,
  winning_number VARCHAR(10) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','drawn','cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leaderboard_daily (
  id BIGSERIAL PRIMARY KEY,
  day_date DATE NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pnl BIGINT NOT NULL DEFAULT 0,
  rounds INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  UNIQUE(day_date,user_id)
);
CREATE INDEX IF NOT EXISTS idx_lb_day_pnl ON leaderboard_daily(day_date,pnl);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message VARCHAR(500) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','deleted')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_date ON chat_messages(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notice_user ON notifications(user_id,is_read,created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  payload_json JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO games(code,name,category,min_bet,max_bet,sort_order) VALUES
('taixiu','Tài Xỉu','dice',1000,10000000,1),
('sicbo','Sicbo Pro','dice',1000,10000000,2),
('dragon','Rồng Hổ','cards',1000,10000000,3),
('baucua','Bầu Cua','dice',1000,10000000,4),
('blackjack','Xì Dách','cards',1000,10000000,5),
('xocdia','Xóc Đĩa','coins',1000,10000000,6),
('baccarat','Baccarat','cards',1000,10000000,7),
('slot','Slot','casino',1000,10000000,8),
('sports','Thể Thao','sports',1000,10000000,9),
('lottery','Lô Đề','lottery',1000,10000000,10)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, min_bet=EXCLUDED.min_bet, max_bet=EXCLUDED.max_bet, sort_order=EXCLUDED.sort_order;

INSERT INTO vip_tiers(code,name,icon,min_balance,bonus_percent,cashback_percent,max_bet,support_level) VALUES
('bronze','BRONZE','🥉',0,0,0,10000000,'Thường'),
('silver','SILVER','🥈',5000000,5,0.5,50000000,'Thường'),
('gold','GOLD','🥇',20000000,10,1,200000000,'VIP 24/7'),
('platinum','PLATINUM','💎',100000000,15,2,1000000000,'VIP 24/7'),
('diamond','DIAMOND','👑',500000000,25,3,9223372036854775807,'VIP 24/7')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon, min_balance=EXCLUDED.min_balance, bonus_percent=EXCLUDED.bonus_percent, cashback_percent=EXCLUDED.cashback_percent, max_bet=EXCLUDED.max_bet, support_level=EXCLUDED.support_level;

INSERT INTO quests(code,name,icon,metric,target,reward,sort_order) VALUES
('q1','Chơi 10 ván','🎲','rounds',10,50000,1),
('q2','Thắng 5 ván','🏆','wins',5,100000,2),
('q3','Cược tổng 1 triệu','💰','wagered',1000000,150000,3),
('q4','Streak 3 ván','🔥','streak',3,200000,4),
('q5','Chơi 5 game','🎮','games',5,120000,5)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon, metric=EXCLUDED.metric, target=EXCLUDED.target, reward=EXCLUDED.reward, sort_order=EXCLUDED.sort_order;

INSERT INTO app_settings(setting_key,setting_value) VALUES
('virtual_balance_mode','1'),
('registration_bonus','1000000'),
('min_bet','1000')
ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value;
