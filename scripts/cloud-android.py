"""Run the normal Gradle wrapper using the prepared cloud toolchain and HTTPS proxy.

Native developers should use android/gradlew directly. No proxy credentials are read or logged.
"""
import os
import pathlib
import subprocess
import sys
import urllib.parse

cache = pathlib.Path('/workspace/.cache')
repo = pathlib.Path(__file__).resolve().parent.parent
environment = os.environ.copy()
defaults = {
    'JAVA_HOME': cache / 'jdk/usr/lib/jvm/java-21-openjdk-amd64',
    'ANDROID_HOME': cache / 'android-sdk',
    'ANDROID_USER_HOME': cache / 'android-user',
    'GRADLE_USER_HOME': cache / 'gradle',
}
for name, value in defaults.items():
    environment.setdefault(name, str(value))
arguments = [str(repo / 'android/gradlew'), '-Duser.home=' + str(cache / 'java-user')]
proxy = urllib.parse.urlparse(environment.get('HTTPS_PROXY', ''))
if proxy.hostname:
    for scheme in ('http', 'https'):
        arguments += [f'-D{scheme}.proxyHost={proxy.hostname}', f'-D{scheme}.proxyPort={proxy.port or 80}']
arguments += sys.argv[1:] or [':app:assembleDebug', ':app:testDebugUnitTest', ':app:lintDebug']
arguments += ['--no-daemon', '--console=plain']
sys.exit(subprocess.run(arguments, cwd=repo / 'android', env=environment).returncode)
