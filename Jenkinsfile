pipeline {
  agent any

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

    stage('Debug') {
      steps {
        sh 'node -v'
        sh 'npm -v'
        sh 'ls -la'
      }
    }

    stage('Install Dependencies') {
      steps {
        sh 'npm install'
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
      }
    }

  }
}
