-- SpendWise SQL schema (MySQL / PostgreSQL compatible)
-- Use this if you prefer SQL over MongoDB. Service code uses the same table shapes.

CREATE TABLE users (
  user_id       VARCHAR(36) PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  category_id VARCHAR(36) PRIMARY KEY,
  user_id     VARCHAR(36),
  name        VARCHAR(100) NOT NULL,
  budget_threshold DECIMAL(12,2) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE expenses (
  expense_id VARCHAR(36) PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  category_id VARCHAR(36),
  amount     DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  date       DATE NOT NULL,
  note       VARCHAR(255),
  payment_method VARCHAR(50) DEFAULT 'cash',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE SET NULL
);

CREATE INDEX idx_expenses_user_date ON expenses(user_id, date);
CREATE INDEX idx_expenses_category ON expenses(category_id);

CREATE TABLE reports (
  report_id    VARCHAR(36) PRIMARY KEY,
  user_id      VARCHAR(36) NOT NULL,
  total_expense DECIMAL(12,2) NOT NULL,
  month        CHAR(7) NOT NULL,          -- 'YYYY-MM'
  breakdown    JSON,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- seed categories
INSERT INTO categories (category_id, name, budget_threshold) VALUES
 ('c-food','Food & Dining', 15000),
 ('c-travel','Travel', 20000),
 ('c-util','Utilities', 8000),
 ('c-shop','Shopping', 12000),
 ('c-health','Health', 10000);
