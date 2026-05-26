const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const POD_SOURCES = [
    "source 'https://cdn.cocoapods.org/'",
    "source 'https://github.com/volcengine/volcengine-specs.git'",
];

function withVolcEnginePodsSource(config) {
    return withDangerousMod(config, ['ios', (config) => {
        const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
        if (!fs.existsSync(podfilePath)) {
            return config;
        }

        let contents = fs.readFileSync(podfilePath, 'utf8');
        const missingSources = POD_SOURCES.filter((source) => !contents.includes(source));
        if (missingSources.length === 0) {
            return config;
        }

        contents = `${missingSources.join('\n')}\n${contents}`;
        fs.writeFileSync(podfilePath, contents);

        return config;
    }]);
}

module.exports = withVolcEnginePodsSource;
