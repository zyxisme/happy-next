const { withGradleProperties, withProjectBuildGradle } = require('expo/config-plugins');

const MAVEN_REPO = "    maven { url 'https://artifact.bytedance.com/repository/Volcengine/' }";

function withVolcEngineAndroidMaven(config) {
    config = withProjectBuildGradle(config, (config) => {
        const buildGradle = config.modResults;
        if (buildGradle.language !== 'groovy') {
            return config;
        }

        if (buildGradle.contents.includes('https://artifact.bytedance.com/repository/Volcengine/')) {
            return config;
        }

        const repositoriesBlock = /(allprojects\s*\{\s*repositories\s*\{\n)/m;
        if (!repositoriesBlock.test(buildGradle.contents)) {
            throw new Error('Could not find allprojects repositories block in android/build.gradle');
        }

        buildGradle.contents = buildGradle.contents.replace(repositoriesBlock, `$1${MAVEN_REPO}\n`);
        return config;
    });

    return withGradleProperties(config, (config) => {
        function setProperty(key, value) {
            const property = config.modResults.find(
                (item) => item.type === 'property' && item.key === key
            );

            if (property) {
                property.value = value;
            } else {
                config.modResults.push({ type: 'property', key, value });
            }
        }

        setProperty('android.enableJetifier', 'true');
        setProperty('org.gradle.jvmargs', '-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError');

        if (!config.modResults.some(
            (item) => item.type === 'property' && item.key === 'org.gradle.workers.max'
        )) {
            config.modResults.push({
                type: 'property',
                key: 'org.gradle.workers.max',
                value: '2',
            });
        }

        return config;
    });
}

module.exports = withVolcEngineAndroidMaven;
