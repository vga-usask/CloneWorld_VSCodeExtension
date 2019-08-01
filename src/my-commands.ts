import * as vscode from 'vscode';
import { CloneReport } from './models/clone-report';
import * as fs from 'fs';
import * as path from 'path';

export class MyCommands {

    static parallelCoordinatePanel: vscode.WebviewPanel | undefined;


    static generateReport(context: vscode.ExtensionContext) {
        return async () => {
            let sourceDirectory = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath.replace(/\\/g, '/') : undefined;
            let sourceBranchName: string | undefined;
            let nicadDirectory = (vscode.workspace.getConfiguration().get('nicad.path') as string).replace(/\\/g, '/');
            let nicadGranularity: string | undefined;
            let nicadLanguage: string | undefined;
            let outputPath: string | undefined;

            sourceBranchName = await vscode.window.showInputBox({ placeHolder: 'Source Branch Name' });
            nicadGranularity = await vscode.window.showQuickPick(['blocks', 'functions'], { placeHolder: 'NiCad Granularity' });
            nicadLanguage = await vscode.window.showQuickPick(['c', 'java', 'python', 'csharp'], { placeHolder: 'NiCad Language' });

            if ((await vscode.window.showQuickPick(['Pick from File Picker'], { placeHolder: 'Output Path' })) === 'Pick from File Picker') {
                let dirList = await vscode.window.showOpenDialog({
                    canSelectFolders: true
                });
                if (dirList) {
                    outputPath = (dirList as unknown as vscode.Uri[])[0].fsPath.replace(/\\/g, '/');

                    const terminal = vscode.window.createTerminal({
                        name: 'Generate Report',
                        cwd: path.join(context.extensionPath.replace(/\\/g, '/'), 'scripts', 'generate-report')
                    });
                    terminal.show();
                    if (process.platform === 'win32') {
                        terminal.sendText('$sourceDirectory=$(wsl wslpath "' + sourceDirectory + '")');
                        terminal.sendText('$nicadDirectory=$(wsl wslpath "' + nicadDirectory + '")');
                        terminal.sendText('$outputPath=$(wsl wslpath "' + outputPath + '")');
                        terminal.sendText(
                            'wsl ./run.sh ' +
                            '$sourceDirectory ' +
                            sourceBranchName + ' ' +
                            '$nicadDirectory ' +
                            nicadGranularity + ' ' +
                            nicadLanguage + ' ' +
                            '$outputPath'
                        );
                    } else {
                        terminal.sendText(
                            './run.sh ' +
                            '"' + sourceDirectory + '" ' +
                            sourceBranchName + ' ' +
                            '"' + nicadDirectory + '" ' +
                            nicadGranularity + ' ' +
                            nicadLanguage + ' ' +
                            '"' + outputPath + '"'
                        );
                    }
                }
            }
        };
    }

    static setReportPath(context: vscode.ExtensionContext) {
        return async () => {
            if ((await vscode.window.showQuickPick(['Pick from File Picker'], { placeHolder: 'Report Path' })) === 'Pick from File Picker') {
                let dirList = await vscode.window.showOpenDialog({
                    canSelectFolders: true
                });
                if (dirList) {
                    await context.workspaceState.update('reportPath', (dirList as unknown as vscode.Uri[])[0].fsPath.replace(/\\/g, '/'));
                    vscode.window.showInformationMessage('Report path is set to ' + context.workspaceState.get('reportPath'));
                } else {
                    vscode.window.showErrorMessage('Fail to set report path.');
                }
            }
        };
    }

    static showReportPath(context: vscode.ExtensionContext) {
        return async () => {
            vscode.window.showInformationMessage('Report path: ' + context.workspaceState.get('reportPath'));
        };
    }

    static showReport(context: vscode.ExtensionContext) {
        return async () => {
            let reportPath = context.workspaceState.get('reportPath');
            let cloneReport: CloneReport | undefined;

            if (reportPath) {
                cloneReport = new CloneReport(
                    JSON.parse(fs.readFileSync(reportPath + '/clone_map.json', 'utf8')),
                    JSON.parse(fs.readFileSync(reportPath + '/global_id_map.json', 'utf8'))
                );
            } else {
                vscode.window.showErrorMessage('Report Path has not been set.');
            }

            if (cloneReport) {
                if (MyCommands.parallelCoordinatePanel) {
                    MyCommands.parallelCoordinatePanel.reveal();
                } else {
                    const onDiskPath = vscode.Uri.file(path.join(context.extensionPath, 'webviews', 'parallel-coordinate'));
                    const panel = vscode.window.createWebviewPanel(
                        'parallel-coordinate',
                        'Parallel Coordinate',
                        vscode.ViewColumn.Beside,
                        {
                            enableScripts: true,
                            localResourceRoots: [
                                onDiskPath
                            ]
                        }
                    );
                    MyCommands.parallelCoordinatePanel = panel;

                    const html = fs.readFileSync(path.join(onDiskPath.fsPath, 'index.html'), 'utf8');
                    MyCommands.parallelCoordinatePanel.webview.html = html.replace(/\.\//g, 'vscode-resource:/' + onDiskPath.fsPath.replace(/\\/g, '/') + '/');

                    MyCommands.parallelCoordinatePanel.webview.onDidReceiveMessage(
                        async message => {
                            switch (message.command) {
                                case 'open-clone':
                                    let workspacePath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath.replace(/\\/g, '/') : undefined;
                                    if (workspacePath) {
                                        let doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(workspacePath, message.file)));
                                        vscode.window.showTextDocument(doc, {
                                            viewColumn: vscode.ViewColumn.Beside,
                                            preview: false,
                                            selection: new vscode.Range(message.start_line - 1, 1, message.end_line - 1, 1)
                                        });
                                    }
                                    return;
                            }
                        },
                        undefined,
                        context.subscriptions
                    );
                    MyCommands.parallelCoordinatePanel.onDidDispose(() => MyCommands.parallelCoordinatePanel = undefined);
                }

                MyCommands.parallelCoordinatePanel.webview.postMessage({
                    cloneReport: cloneReport
                });
            }
        };
    }

    static findClonesInSameClass(context: vscode.ExtensionContext) {
        return async () => {
            let editor = vscode.window.activeTextEditor;
            if (editor) {
                const position = editor.selection.active.line + 1;
                const workspacePath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : undefined;

                if (workspacePath) {
                    if (!MyCommands.parallelCoordinatePanel) {
                        vscode.commands.executeCommand('cloneWorld.showReport');
                    }
                    MyCommands.parallelCoordinatePanel!.webview.postMessage({
                        filePath: editor.document.uri.fsPath.replace(/\\/g, '/').substring((workspacePath.uri.fsPath.replace(/\\/g, '/') + '/').length),
                        lineNumber: position
                    });
                }
            }
        };
    }

}