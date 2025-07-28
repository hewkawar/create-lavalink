#!/usr/bin/env node

import { confirm, input, select } from '@inquirer/prompts';
import { execSync } from 'child_process';
import logUpdate from 'log-update';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import yaml from 'js-yaml';

const streamPipeline = promisify(pipeline);

const loadingFrames = [
    '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'
];

function runCommand(command) {
    try {
        execSync(`${command}`, { stdio: "inherit" });
    } catch (err) {
        console.error(`Failed to execute ${command}`, err);
        return false;
    }
    return true;
}

async function downloadFile(url, destination, text = 'Downloading...') {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const totalSize = response.headers.get('content-length');
    let downloadedSize = 0;

    const totaledSizeMB = totalSize ? (totalSize / 1024 / 1024).toFixed(2) : 'unknown';

    let i = 0;
    const interval = setInterval(() => {
        const frame = loadingFrames[i++ % loadingFrames.length];
        const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
        logUpdate(`${frame} ${text} (${downloadedMB} MB / ${totaledSizeMB} MB)`);
    }, 100);

    const fileStream = fs.createWriteStream(destination);
    const reader = response.body.getReader();

    async function writeToFile() {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            downloadedSize += value.length;
            fileStream.write(value);
        }
        fileStream.end();
    }

    await writeToFile();

    clearInterval(interval);
    logUpdate(`\x1b[32m✔\x1b[0m ${text} (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${totaledSizeMB} MB)`);
}

async function createLavalink() {
    const versionList = await fetch('https://api.github.com/repos/lavalink-devs/Lavalink/releases').then(res => res.json()).catch(err => {
        console.error('Failed to fetch Lavalink versions:', err)
        process.exit(1)
    });

    const dir = await input({
        message: 'What is your server named?',
        default: 'lavalink-server',
        required: true,
    });

    if (fs.existsSync(dir)) {
        const overwrite = await confirm({
            message: `Directory "${dir}" already exists. Do you want to continue?`,
            default: false,
            required: true,
        });

        if (!overwrite) {
            console.log('Operation cancelled by user.');
            process.exit(0);
        } else {
            process.chdir(dir);
        }
    } else {
        if (!runCommand(`mkdir ${dir}`)) {
            console.error('Failed to create directory');
            process.exit(1);
        }
        process.chdir(dir);
    }

    const version = await select({
        message: 'Which version of Lavalink do you want to use?',
        choices: versionList.sort((a, b) => b.name - a.name).map((release, index) => ({
            name: release.tag_name,
            value: release.tag_name
        })),
        default: versionList[0].tag_name,
        required: true,
        loop: false,
        theme: {
            indexMode: 'number',
        },
    });

    const runScript = await confirm({
        message: 'Do you need to get the run script file?',
        default: false,
        required: true,
    });

    // Download the Lavalink jar file
    const jarUrl = `https://github.com/lavalink-devs/Lavalink/releases/download/${version}/Lavalink.jar`;
    const jarFile = 'Lavalink.jar';
    try {
        await downloadFile(jarUrl, jarFile, `Downloading Lavalink version ${version}...`);
    } catch (err) {
        console.error('Failed to download Lavalink:', err);
        process.exit(1);
    }

    // Create the application.yml file
    const exampleYml = await fetch('https://raw.githubusercontent.com/hewkawar/create-lavalink/refs/heads/main/files/application.example.yaml').then(res => res.text()).catch(err => {
        console.error('Failed to fetch example.application.yml:', err);
        process.exit(1);
    });
    
    const needConfig = await confirm({
        message: 'Do you need to config application.yml?',
        default: false,
        required: true,
    });
    
    if (needConfig) {
        const json = yaml.load(exampleYml);

        const address = await input({
            message: 'What is the address?',
            default: json.server.address,
            required: true,
        });
        const port = await input({
            message: 'What is the port?',
            default: json.server.port,
            required: true,
        });
        const password = await input({
            message: 'What is the password?',
            default: json.lavalink.server.password,
            required: false,
        });
        json.server.address = address;
        json.server.port = port;
        json.lavalink.server.password = password;
        fs.writeFileSync('application.yml', yaml.dump(json));
    } else {
        const needComment = await confirm({
            message: 'Do you need to comment the application.yml?',
            default: false,
            required: true,
        });

        const json = yaml.load(exampleYml);


        fs.writeFileSync('application.yml', needComment ? exampleYml : yaml.dump(json));
    }

    console.log('application.yml created successfully.');

    // Create the run script if needed
    if (runScript) {
        // Linux/MacOS run script
        const runScriptContent = `#!/bin/sh\njava -jar Lavalink.jar`;
        fs.writeFileSync('run.sh', runScriptContent);
        fs.chmodSync('run.sh', '755'); // Make the script executable
        console.log('Linux/MacOS run script created successfully.');
        
        // Windows run script
        const runScriptWindowsContent = `@echo off\njava -jar Lavalink.jar`;
        fs.writeFileSync('run.bat', runScriptWindowsContent);
        console.log('Windows run script created successfully.');
    }

    // Final steps
    console.log(`\nLavalink server setup completed in directory: ${dir}`);
    console.log('You can now run the server using the provided run scripts:');
    console.log('');
    console.log('    java -jar Lavalink.jar');
    console.log('or');
    console.log('    ./run.sh (Linux/MacOS)');
    console.log('    run.bat (Windows)');
    console.log('');
    console.log('For more information, visit: https://docs.lavalink.dev');
    console.log('Thank you for using create-lavalink!');
    console.log('If you have any issues, please report them at: https://github.com/hewkawar/create-lavalink/issues');
}

createLavalink();