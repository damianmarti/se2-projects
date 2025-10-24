CREATE TABLE repositories (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    homepage VARCHAR(255),
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(255)[]
);

CREATE INDEX idx_repositories_owner ON repositories(owner);
CREATE INDEX idx_repositories_stars ON repositories(stars DESC);
CREATE INDEX idx_repositories_forks ON repositories(forks DESC);
CREATE INDEX idx_repositories_created_at ON repositories(created_at);
CREATE INDEX idx_repositories_updated_at ON repositories(updated_at);
CREATE INDEX idx_repositories_last_seen ON repositories(last_seen);