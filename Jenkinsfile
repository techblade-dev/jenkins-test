// Core Pipeline only: no NodeJS tool, Docker agent, AnsiColor, or readJSON plugins.
// On Linux, downloads Node into ~/.cache/jenkins-node if `node` is missing.
// If TLS/download fails: set job env HTTPS_PROXY, or NODEJS_DIST_BASE (same layout as nodejs.org/dist), or install Node on the agent.
pipeline {
  agent any

  options {
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
    disableConcurrentBuilds()
  }

  environment {
    HUSKY = '0'
    CI = 'true'
  }

  triggers {
    pollSCM('H/5 * * * *')
  }

  stages {

    stage('Bootstrap Node') {
      steps {
        sh '''
          set -euo pipefail
          umask 022
          # Pin version — change here when you change local dev
          V="22.12.0"
          M="$(uname -m)"
          case "$M" in
            x86_64)  SUFFIX="x64" ;;
            aarch64|arm64) SUFFIX="arm64" ;;
            *) echo "Unsupported architecture: $M"; exit 1 ;;
          esac
          NAME="node-v${V}-linux-${SUFFIX}"
          TAR="${NAME}.tar.gz"
          CACHE_ROOT="${HOME}/.cache/jenkins-node"
          DEST="${CACHE_ROOT}/${NAME}"
          mkdir -p "${WORKSPACE}/.jenkins"
          ENVFILE="${WORKSPACE}/.jenkins/node-env"

          if command -v node >/dev/null 2>&1; then
            echo "Node already on PATH: $(command -v node) ($(node -v))"
            echo "export PATH=\"${PATH}\"" > "${ENVFILE}"
            exit 0
          fi

          if [ -x "${DEST}/bin/node" ]; then
            echo "Reusing cached Node at ${DEST}"
            echo "export PATH=\"${DEST}/bin:\${PATH}\"" > "${ENVFILE}"
            . "${ENVFILE}"
            node -v
            exit 0
          fi

          mkdir -p "${CACHE_ROOT}"
          cd "${CACHE_ROOT}"
          if [ ! -f "${TAR}" ] || [ ! -s "${TAR}" ]; then
            rm -f "${TAR}"
            BASE="${NODEJS_DIST_BASE:-https://nodejs.org/dist}"
            URL="${BASE}/v${V}/${TAR}"
            echo "Downloading ${TAR} from ${URL}"
            ok=0
            for attempt in 1 2 3 4 5; do
              echo "Download attempt ${attempt}..."
              if curl -fsSLO --connect-timeout 30 --max-time 900 --retry 3 --retry-delay 5 -4 --http1.1 \
                --retry-connrefused \
                "${URL}"; then
                ok=1
                break
              fi
              echo "curl failed (SSL or network), sleeping..."
              sleep $((attempt * 5))
            done
            if [ "$ok" != 1 ]; then
              echo "Retrying without forcing IPv4..."
              if curl -fsSLO --connect-timeout 30 --max-time 900 --retry 3 --http1.1 --retry-connrefused "${URL}"; then
                ok=1
              fi
            fi
            if [ "$ok" != 1 ] || [ ! -s "${TAR}" ]; then
              echo "Could not download Node. Options:"
              echo "  - Set HTTPS_PROXY (and http_proxy) on the agent if a proxy is required"
              echo "  - Set job env NODEJS_DIST_BASE to an internal mirror (same path layout as nodejs.org/dist)"
              echo "  - Install Node on the agent and put it on PATH (Bootstrap will skip the download)"
              exit 1
            fi
          fi
          if ! tar -tzf "${TAR}" >/dev/null 2>&1; then
            echo "Corrupt or incomplete ${TAR}, delete and retry: ${CACHE_ROOT}/${TAR}"
            exit 1
          fi
          rm -rf "${NAME}"
          tar -xzf "${TAR}"
          test -x "${NAME}/bin/node"
          echo "export PATH=\"${CACHE_ROOT}/${NAME}/bin:\${PATH}\"" > "${ENVFILE}"
          . "${ENVFILE}"
          node -v
          npm -v
        '''
      }
    }

    stage('Validate Commit Format') {
      steps {
        script {
          def message = sh(
            script: 'git log -1 --pretty=%B',
            returnStdout: true
          ).trim()
          echo "Commit message: ${message}"
          if (!(message ==~ /^[a-zA-Z0-9]{7,8} - .+/)) {
            error("Invalid commit format. Use: <TRELLO_ID> - message")
          }
        }
      }
    }

    stage('Info') {
      steps {
        sh '''
          set -euo pipefail
          . "${WORKSPACE}/.jenkins/node-env"
          echo "---"
          which node
          node -v
          npm -v
          git --version
          pwd
          ls -la
        '''
      }
    }

    stage('Install dependencies') {
      steps {
        sh '''
          set -euo pipefail
          . "${WORKSPACE}/.jenkins/node-env"
          if [ -f package-lock.json ]; then
            npm ci --no-audit --no-fund
          else
            npm install --no-audit --no-fund
          fi
        '''
      }
    }

    stage('Lint (optional)') {
      when {
        expression {
          sh(script: 'grep -E "^[[:space:]]*\\"lint\\"[[:space:]]*:" package.json', returnStatus: true) == 0
        }
      }
      steps {
        sh '''
          set -euo pipefail
          . "${WORKSPACE}/.jenkins/node-env"
          npm run lint
        '''
      }
    }

    stage('Build') {
      steps {
        sh '''
          set -euo pipefail
          . "${WORKSPACE}/.jenkins/node-env"
          npm run build
        '''
      }
    }

  }

  post {
    always {
      echo "Build status: ${currentBuild.currentResult}"
    }
  }
}
