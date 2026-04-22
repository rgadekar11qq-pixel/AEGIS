#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  deploy-amd-cloud.sh
#  One-command deployment to AMD Developer Cloud
#
#  Prerequisites:
#    1. An AMD Developer Cloud instance (devcloud.amd.com) with
#       Docker pre-installed (most images include it).
#    2. SSH access configured (key or password).
#    3. Your GEMINI_API_KEY ready.
#
#  Usage:
#    chmod +x deploy-amd-cloud.sh
#
#    # Interactive — prompts for everything:
#    ./deploy-amd-cloud.sh
#
#    # Non-interactive:
#    ./deploy-amd-cloud.sh \
#        --host <IP_OR_HOSTNAME> \
#        --user <SSH_USER> \
#        --key  <PATH_TO_SSH_KEY> \
#        --gemini-key <YOUR_GEMINI_API_KEY> \
#        --port 3000
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[  OK]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ── Defaults ─────────────────────────────────────────────────────
REMOTE_HOST=""
REMOTE_USER="amd"
SSH_KEY=""
GEMINI_KEY=""
APP_PORT="3000"
REMOTE_DIR="/home/amd/clinical-pipeline"
IMAGE_NAME="clinical-pipeline"
IMAGE_TAG="latest"

# ── Parse args ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)        REMOTE_HOST="$2"; shift 2 ;;
    --user)        REMOTE_USER="$2"; shift 2 ;;
    --key)         SSH_KEY="$2";     shift 2 ;;
    --gemini-key)  GEMINI_KEY="$2";  shift 2 ;;
    --port)        APP_PORT="$2";    shift 2 ;;
    --remote-dir)  REMOTE_DIR="$2";  shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--host HOST] [--user USER] [--key SSH_KEY] [--gemini-key KEY] [--port PORT]"
      exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

# ── Interactive prompts for missing values ───────────────────────
echo -e "\n${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Clinical Pipeline — AMD Developer Cloud Deployment  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}\n"

if [[ -z "$REMOTE_HOST" ]]; then
  read -rp "$(echo -e "${CYAN}AMD Cloud instance IP/hostname:${NC} ")" REMOTE_HOST
  [[ -z "$REMOTE_HOST" ]] && fail "Host is required."
fi

if [[ -z "$SSH_KEY" ]]; then
  read -rp "$(echo -e "${CYAN}SSH private key path [~/.ssh/id_rsa]:${NC} ")" SSH_KEY
  SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
fi

if [[ -z "$GEMINI_KEY" ]]; then
  read -rp "$(echo -e "${CYAN}Gemini API Key (leave blank to skip):${NC} ")" GEMINI_KEY
fi

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -i ${SSH_KEY}"
SSH_CMD="ssh ${SSH_OPTS} ${REMOTE_USER}@${REMOTE_HOST}"
SCP_CMD="scp ${SSH_OPTS}"

# ── Step 1: Verify SSH Connectivity ─────────────────────────────
info "Testing SSH connection to ${REMOTE_USER}@${REMOTE_HOST}…"
if ! $SSH_CMD "echo 'SSH OK'" &>/dev/null; then
  fail "Cannot SSH into ${REMOTE_USER}@${REMOTE_HOST}. Check host, user, and key."
fi
ok "SSH connection established."

# ── Step 2: Verify Docker on Remote ─────────────────────────────
info "Checking Docker installation on remote host…"
DOCKER_VERSION=$($SSH_CMD "docker --version 2>/dev/null || echo 'NOT_FOUND'")
if [[ "$DOCKER_VERSION" == "NOT_FOUND" ]]; then
  warn "Docker not found. Installing Docker…"
  $SSH_CMD "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER"
  ok "Docker installed. You may need to reconnect for group changes."
else
  ok "Docker found: ${DOCKER_VERSION}"
fi

# Check Docker Compose
COMPOSE_CHECK=$($SSH_CMD "docker compose version 2>/dev/null || echo 'NOT_FOUND'")
if [[ "$COMPOSE_CHECK" == "NOT_FOUND" ]]; then
  warn "Docker Compose plugin not found. Installing…"
  $SSH_CMD "sudo mkdir -p /usr/local/lib/docker/cli-plugins && \
    sudo curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose && \
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose"
  ok "Docker Compose installed."
else
  ok "Docker Compose found: ${COMPOSE_CHECK}"
fi

# ── Step 3: Upload project files ────────────────────────────────
info "Creating remote directory ${REMOTE_DIR}…"
$SSH_CMD "mkdir -p ${REMOTE_DIR}"

info "Uploading project files…"

# Create a tarball (excluding node_modules, .git, etc.)
TAR_FILE="/tmp/clinical-pipeline-deploy.tar.gz"
tar -czf "${TAR_FILE}" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='test.js' \
  --exclude='test_*.txt' \
  --exclude='server_*.log' \
  -C "$(dirname "$0")" .

${SCP_CMD} "${TAR_FILE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/deploy.tar.gz"
$SSH_CMD "cd ${REMOTE_DIR} && tar -xzf deploy.tar.gz && rm deploy.tar.gz"
rm -f "${TAR_FILE}"

ok "Project files uploaded."

# ── Step 4: Create .env on remote ────────────────────────────────
info "Configuring environment on remote host…"
$SSH_CMD "cat > ${REMOTE_DIR}/.env << 'ENVEOF'
NODE_ENV=production
PORT=3000
GEMINI_API_KEY=${GEMINI_KEY:-YOUR_GEMINI_API_KEY_HERE}
ENVEOF"
ok "Environment configured."

# ── Step 5: Build & Launch ──────────────────────────────────────
info "Building Docker image on remote host (this may take 1-2 minutes)…"
$SSH_CMD "cd ${REMOTE_DIR} && docker compose down --remove-orphans 2>/dev/null || true"
$SSH_CMD "cd ${REMOTE_DIR} && docker compose build --no-cache"
ok "Image built successfully."

info "Starting container…"
$SSH_CMD "cd ${REMOTE_DIR} && docker compose up -d"
ok "Container started."

# ── Step 6: Health Check ────────────────────────────────────────
info "Waiting for service to become healthy…"
RETRIES=10
for i in $(seq 1 $RETRIES); do
  HEALTH=$($SSH_CMD "curl -sf http://localhost:${APP_PORT}/health 2>/dev/null || echo 'UNHEALTHY'")
  if [[ "$HEALTH" != "UNHEALTHY" ]]; then
    ok "Service is healthy!"
    break
  fi
  if [[ $i -eq $RETRIES ]]; then
    warn "Service did not become healthy after ${RETRIES} attempts. Check logs:"
    echo -e "  ${CYAN}ssh ${REMOTE_USER}@${REMOTE_HOST} 'docker compose -f ${REMOTE_DIR}/docker-compose.yml logs'${NC}"
  fi
  sleep 3
done

# ── Step 7: Print summary ──────────────────────────────────────
REMOTE_IP="${REMOTE_HOST}"
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  ✅  Deployment Complete                             ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${GREEN}Frontend:${NC}  http://${REMOTE_IP}:${APP_PORT}/             ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${GREEN}API:${NC}       http://${REMOTE_IP}:${APP_PORT}/health       ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${CYAN}Useful commands:${NC}                                   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}    Logs:    ssh … 'docker compose logs -f'           ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}    Stop:    ssh … 'docker compose down'              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}    Restart: ssh … 'docker compose restart'           ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}NOTE: If you need to open port ${APP_PORT} in the AMD Cloud firewall,${NC}"
echo -e "${YELLOW}check your instance's security group / network settings at devcloud.amd.com${NC}"
