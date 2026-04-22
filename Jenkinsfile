// Core Pipeline only: no NodeJS tool, Docker agent, AnsiColor, or readJSON plugins.
// On Linux, downloads Node from nodejs.org into ~/.cache/jenkins-node if `node` is missing.
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
          if [ ! -f "${TAR}" ]; then
            echo "Downloading ${TAR} ..."
            curl -fsSLO "https://nodejs.org/dist/v${V}/${TAR}"
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
