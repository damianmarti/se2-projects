# 📊 Projects Using Scaffold-ETH 2

<h4 align="center">
  <a href="https://docs.scaffoldeth.io">Scaffold-ETH 2 Docs</a> |
  <a href="https://scaffoldeth.io">Website</a> |
  <a href="https://github.com/scaffold-eth/scaffold-eth-2">GitHub</a>
</h4>

🔍 **Discover and analyze repositories that use Scaffold-ETH 2** - an open-source toolkit for building decentralized applications on Ethereum.

This project provides comprehensive tools to find, collect, and analyze projects built with Scaffold-ETH 2, offering insights into the ecosystem's growth and adoption.

## ✨ What You'll Find Here

- 📈 **Repository Statistics**: Total count, stars, forks, and growth trends
- 🔍 **Advanced Discovery**: Multiple methods to find Scaffold-ETH projects
- 🗄️ **Database Analytics**: PostgreSQL-powered data storage and analysis
- 🌐 **Web Interface**: Interactive dashboard to explore discovered projects
- 📊 **Real-time Data**: Live statistics and repository information

## 📋 Requirements

Before you begin, you need to install the following tools:

- [Node.js (>= v20.18.3)](https://nodejs.org/en/download/)
- [Yarn](https://yarnpkg.com/getting-started/install) (v1 or v2+)
- [Git](https://git-scm.com/downloads)
- [PostgreSQL](https://www.postgresql.org/download/) (for data storage)
- [GitHub Personal Access Token](https://github.com/settings/tokens) (for API access)

## 🚀 Quickstart

### 1. Clone and Install
```bash
git clone https://github.com/damianmarti/se2-projects.git
cd se2-projects
yarn install
```

### 2. Set Up Database
```bash
# Create PostgreSQL database
createdb repositories

# Run the schema setup
psql -d repositories -f packages/scripts/database/repositories.sql
```

### 3. Configure Environment
Create `.env` files in both `packages/nextjs/` and `packages/scripts/`:

```env
# GitHub API Configuration
GITHUB_TOKEN=your_github_token_here

# Database Configuration
POSTGRES_URL=postgresql://username:password@localhost:5432/repositories
```

### 4. Collect Repository Data
```bash
# Run data collection scripts (from root folder)
yarn scripts:dependents-api    # Find repos via GitHub API
yarn scripts:search-filename   # Find repos by filename
yarn scripts:scrape           # Scrape GitHub dependents page
```

### 5. Start the Web Interface
```bash
cd packages/nextjs
yarn start
```

Visit `http://localhost:3000` to see the repository dashboard!

## 🔍 Data Collection Methods

Our scripts use multiple approaches to discover Scaffold-ETH projects:

### 1. **GitHub API Dependency Analysis** (`scripts:dependents-api`)
- Searches package.json, yarn.lock, package-lock.json files
- Finds repositories that depend on Scaffold-ETH packages
- Bypasses GitHub's 1000-result limit through path sharding
- **Command**: `yarn scripts:dependents-api`

### 2. **Filename Search** (`scripts:search-filename`)
- Searches for `scaffold.config.ts` files across repositories
- Uses path and size sharding for comprehensive coverage
- Focuses on Next.js project structures
- **Command**: `yarn scripts:search-filename`

### 3. **Web Scraping** (`scripts:scrape`)
- Scrapes GitHub's "Used by" page for burner-connector
- Uses Puppeteer for comprehensive coverage
- Handles pagination and rate limiting automatically
- **Command**: `yarn scripts:scrape`

## 📊 Web Interface Features

The web interface provides:

- **📈 Dashboard**: Overview statistics and trends
- **🔍 Repository Browser**: Searchable, sortable repository list
- **📊 Analytics**: Stars, forks, creation dates, and more
- **🔗 Direct Links**: Click to visit repositories and homepages
- **📱 Responsive Design**: Works on desktop and mobile


## 📚 Additional Resources

- **[Scripts Documentation](packages/scripts/README.md)**: Detailed setup and usage for data collection scripts
- **[Database Schema](packages/scripts/database/repositories.sql)**: PostgreSQL table structure and setup
- **[Scaffold-ETH 2 Docs](https://docs.scaffoldeth.io)**: Official documentation for building dApps
- **[Scaffold-ETH Website](https://scaffoldeth.io)**: Learn more about the framework

## 🛠️ Project Structure

```
packages/
├── nextjs/                 # Web interface and dashboard
│   ├── app/               # Pages: / (stats), /repositories (list)
│   ├── app/api/           # API routes for data fetching
│   └── types/             # TypeScript definitions
└── scripts/               # Data collection tools
    ├── src/               # Collection scripts
    │   ├── fetch-dependents-api.ts    # GitHub API search
    │   ├── search-by-filename.ts      # Filename-based search
    │   ├── scrape-dependents.ts      # Web scraping
    │   └── common.ts                 # Shared utilities
    └── database/          # PostgreSQL schema
```

## 📊 Current Statistics

*Run the data collection scripts to see live statistics in the web interface*

- **Total Repositories**: Discovered projects using Scaffold-ETH
- **Stars & Forks**: Community engagement metrics
- **Growth Trends**: Recent projects and adoption patterns
- **Source Analysis**: Breakdown by discovery method

## 🤝 Contributing

Help us discover more Scaffold-ETH projects! Contributions welcome:

1. **Run the scripts** to collect more data
2. **Improve discovery methods** for better coverage
3. **Enhance the web interface** with new features
4. **Add new data sources** for comprehensive analysis

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.