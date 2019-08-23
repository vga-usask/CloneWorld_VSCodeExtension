// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MyCommands } from './my-commands';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { CloneReport } from './models/clone-report';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "clone-world" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(vscode.commands.registerCommand('cloneWorld.generateReport', MyCommands.generateReport(context)));
	context.subscriptions.push(vscode.commands.registerCommand('cloneWorld.setReportPath', MyCommands.setReportPath(context)));
	context.subscriptions.push(vscode.commands.registerCommand('cloneWorld.showReportPath', MyCommands.showReportPath(context)));
	context.subscriptions.push(vscode.commands.registerCommand('cloneWorld.showReport', MyCommands.showReport(context)));
	context.subscriptions.push(vscode.commands.registerCommand('cloneWorld.findClonesInSameClass', MyCommands.findClonesInSameClass(context)));

	vscode.workspace.onDidSaveTextDocument(()=>{
		console.log('saved');
		const nicadParams = fs.readFileSync(context.workspaceState.get('reportPath') + '/nicad-params', 'utf8').split('\n');
		let sourceDirectory = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath.replace(/\\/g, '/') : undefined;
		let sourceBranchName = nicadParams[0];
        let nicadGranularity = nicadParams[1];
		let nicadLanguage = nicadParams[2];
		let outputPath = nicadParams[3];
		
		let cloneReport = new CloneReport(
			JSON.parse(fs.readFileSync(outputPath + '/clone_map.json', 'utf8')),
			JSON.parse(fs.readFileSync(outputPath + '/global_id_map.json', 'utf8'))
		);
		
		const terminal = vscode.window.createTerminal({
			name: 'Generate Report',
			cwd: path.join(context.extensionPath.replace(/\\/g, '/'), 'scripts', 'report-generator')
		});
		terminal.show();
		if (process.platform === 'win32') {
			terminal.sendText('$sourceDirectory=$(wsl wslpath "' + sourceDirectory + '")');
			terminal.sendText('$outputPath=$(wsl wslpath "' + outputPath + '")');
			terminal.sendText(
				'wsl ./update.sh ' +
				'$sourceDirectory ' +
				sourceBranchName + ' ' +
				nicadGranularity + ' ' +
				nicadLanguage + ' ' +
				'$outputPath'
			);
			terminal.sendText('exit');
		} else {
			terminal.sendText(
				'./update.sh ' +
				'"' + sourceDirectory + '" ' +
				sourceBranchName + ' ' +
				nicadGranularity + ' ' +
				nicadLanguage + ' ' +
				'"' + outputPath + '"'
			);
			terminal.sendText('exit');
		}
	});
}

// this method is called when your extension is deactivated
export function deactivate() {}
