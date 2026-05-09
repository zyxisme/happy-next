const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'react-native-audio-api 0.12.x installs FFmpeg as vendored xcframeworks';

const RUBY_PATCH = `
    # ${MARKER}
    # under the RNAudioAPI pod target, but the app aggregate target does not
    # inherit all dynamic framework link settings. Add them explicitly so
    # FFmpeg symbols referenced by libRNAudioAPI.a resolve at app link time.
    ffmpeg_frameworks = %w[libavcodec libavformat libavutil libswresample]
    ffmpeg_support_dirs = Dir.glob(File.join(installer.sandbox.root, 'Target Support Files', 'Pods-*'))
      .select { |dir| File.directory?(dir) }

    ffmpeg_support_dirs.each do |support_dir|
      %w[debug release].each do |configuration|
        xcconfig_path = File.join(support_dir, "#{File.basename(support_dir)}.#{configuration}.xcconfig")
        next unless File.exist?(xcconfig_path)

        xcconfig = File.read(xcconfig_path)
        ffmpeg_search_path = '"\${PODS_XCFRAMEWORKS_BUILD_DIR}/RNAudioAPI"'
        if xcconfig.match?(/^FRAMEWORK_SEARCH_PATHS = /)
          xcconfig.gsub!(/^FRAMEWORK_SEARCH_PATHS = (.*)$/) do
            paths = Regexp.last_match(1)
            paths.include?(ffmpeg_search_path) ? Regexp.last_match(0) : "FRAMEWORK_SEARCH_PATHS = #{paths} #{ffmpeg_search_path}"
          end
        else
          xcconfig << "\\nFRAMEWORK_SEARCH_PATHS = $(inherited) #{ffmpeg_search_path}\\n"
        end

        ffmpeg_ldflags = ffmpeg_frameworks.map { |name| "-framework \\"#{name}\\"" }.join(' ')
        if xcconfig.match?(/^OTHER_LDFLAGS = /)
          xcconfig.gsub!(/^OTHER_LDFLAGS = (.*)$/) do
            flags = Regexp.last_match(1)
            flags.include?('-framework "libavcodec"') ? Regexp.last_match(0) : "OTHER_LDFLAGS = #{flags} #{ffmpeg_ldflags}"
          end
        else
          xcconfig << "\\nOTHER_LDFLAGS = $(inherited) #{ffmpeg_ldflags}\\n"
        end

        File.write(xcconfig_path, xcconfig)
      end

      frameworks_script_path = File.join(support_dir, "#{File.basename(support_dir)}-frameworks.sh")
      next unless File.exist?(frameworks_script_path)

      frameworks_script = File.read(frameworks_script_path)
      ffmpeg_frameworks.each do |name|
        install_line = %(install_framework "\${PODS_XCFRAMEWORKS_BUILD_DIR}/RNAudioAPI/#{name}.framework")
        frameworks_script << "\\n#{install_line}" unless frameworks_script.include?(install_line)
      end
      File.write(frameworks_script_path, frameworks_script)
    end
`;

function withRNAudioAPIIosFFmpeg(config) {
    return withDangerousMod(config, ['ios', (config) => {
        const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
        if (!fs.existsSync(podfilePath)) {
            return config;
        }

        let contents = fs.readFileSync(podfilePath, 'utf8');
        if (contents.includes(MARKER)) {
            return config;
        }

        const postInstallCall = /(\n\s+react_native_post_install\([\s\S]*?\n\s+\)\n)/m;
        if (!postInstallCall.test(contents)) {
            throw new Error('Could not find react_native_post_install in ios/Podfile');
        }

        contents = contents.replace(postInstallCall, `$1${RUBY_PATCH}`);
        fs.writeFileSync(podfilePath, contents);

        return config;
    }]);
}

module.exports = withRNAudioAPIIosFFmpeg;
