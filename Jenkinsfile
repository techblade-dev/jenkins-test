pipeline {
  agent any

  stages {

    stage('Validate Commit Format') {
      steps {
        script {
          def message = bat(script: 'git log -1 --pretty=%B', returnStdout: true).trim()

          if (!(message ==~ /^[a-zA-Z0-9]{8}:.*/)) {
            error("❌ Invalid commit format. Use: <TRELLO_ID>: message")
          }
        }
      }
    }

    stage('Debug') {
        steps {
            bat 'node -v'
            bat 'npm -v'
            bat 'dir'
        }
    }

    stage('Install Dependencies') {
      steps {
        bat 'npm install'
      }
    }

    stage('Build') {
      steps {
        bat 'npm run build'
      }
    }

  }
}