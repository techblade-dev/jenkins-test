pipeline {
  agent any

  tools {
    nodejs 'node22'
  }

  options {
    timestamps()
    ansiColor('xterm')
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
    disableConcurrentBuilds()
    skipDefaultCheckout(false)
  }

  environment {
    CI = 'true'
    HUSKY = '0'
    NPM_CONFIG_FUND = 'false'
    NPM_CONFIG_AUDIT = 'false'
    NODE_ENV = 'production'
  }

  triggers {
    pollSCM('H/5 * * * *')
  }

  stages {

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

    stage('Environment') {
      steps {
        sh '''
          set -eu
          echo "--- Tools ---"
          node -v
          npm -v
          git --version
          echo "--- Workspace ---"
          pwd
          ls -la
        '''
      }
    }

    stage('Install Dependencies') {
      steps {
        sh '''
          set -eu
          if [ -f package-lock.json ]; then
            npm ci --no-audit --no-fund
          else
            npm install --no-audit --no-fund
          fi
        '''
      }
    }

    stage('Quality') {
      parallel {
        stage('Lint') {
          when {
            expression {
              def pkg = readJSON file: 'package.json'
              return pkg.scripts?.lint
            }
          }
          steps {
            sh 'npm run lint'
          }
        }
        stage('Typecheck') {
          when {
            expression { fileExists('tsconfig.json') || fileExists('tsconfig.app.json') }
          }
          steps {
            sh 'npx --no-install tsc -b --pretty false || npx tsc -b --pretty false'
          }
        }
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
      }
      post {
        success {
          script {
            if (fileExists('dist')) {
              archiveArtifacts artifacts: 'dist/**/*', fingerprint: true, onlyIfSuccessful: true
            }
          }
        }
      }
    }

  }

  post {
    always {
      echo "Build ${currentBuild.fullDisplayName} finished with status: ${currentBuild.currentResult}"
    }
    cleanup {
      cleanWs(
        deleteDirs: true,
        notFailBuild: true,
        patterns: [
          [pattern: 'node_modules/**', type: 'INCLUDE'],
          [pattern: '.npm/**',         type: 'INCLUDE']
        ]
      )
    }
  }
}
