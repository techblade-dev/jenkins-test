pipeline {
  agent any

  environment {
    HUSKY = '0'
  }

  triggers {
    pollSCM('H/5 * * * *')
  }

  stages {

    stage('Validate Commit Format') {
      steps {
        script {
          def message = sh(script: 'git log -1 --pretty=%B', returnStdout: true).trim()

          if (!(message ==~ /^[a-zA-Z0-9]{7,8} - .+/)) {
            error("Invalid commit format. Use: <TRELLO_ID> - message")
          }
        }
      }
    }

    stage('Node') {
      agent {
        docker {
          image 'node:22-bookworm'
        }
      }
      stages {
        stage('Debug') {
          steps {
            sh 'node -v && npm -v && ls -la'
          }
        }

        stage('Install Dependencies') {
          steps {
            sh 'npm ci'
          }
        }

        stage('Build') {
          steps {
            sh 'npm run build'
          }
        }
      }
    }

  }
}
