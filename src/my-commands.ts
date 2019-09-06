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
                        cwd: path.join(context.extensionPath.replace(/\\/g, '/'), 'scripts', 'report-generator')
                    });
                    terminal.show();
                    if (process.platform === 'win32') {
                        terminal.sendText('$sourceDirectory=$(wsl wslpath "' + sourceDirectory + '")');
                        terminal.sendText('$outputPath=$(wsl wslpath "' + outputPath + '")');
                        terminal.sendText(
                            'wsl ./initialize.sh ' +
                            '$sourceDirectory ' +
                            sourceBranchName + ' ' +
                            nicadGranularity + ' ' +
                            nicadLanguage + ' ' +
                            '$outputPath'
                        );
                    } else {
                        terminal.sendText(
                            './initialize.sh ' +
                            '"' + sourceDirectory + '" ' +
                            sourceBranchName + ' ' +
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
            let cloneReport = MyCommands.obtainCloneReport(reportPath);

            if (cloneReport) {
                if (MyCommands.parallelCoordinatePanel) {
                    MyCommands.parallelCoordinatePanel.reveal();
                } else {
                    const onDiskPath = vscode.Uri.file(path.join(context.extensionPath, 'webviews', 'report-vis'));
                    const panel = vscode.window.createWebviewPanel(
                        'report-vis',
                        'Report Vis',
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
                    const prefix = onDiskPath.fsPath.replace(/\\/g, '/').substring(0, 1) === '/' ? 'vscode-resource:' : 'vscode-resource:/';
                    MyCommands.parallelCoordinatePanel.webview.html = html.replace(/\.\//g, prefix + onDiskPath.fsPath.replace(/\\/g, '/') + '/');

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
                                case 'refresh':
                                    webview.postMessage({
                                        cloneReport: MyCommands.obtainCloneReport(reportPath)
                                    });
                                    break;
                            }
                        },
                        undefined,
                        context.subscriptions
                    );
                    MyCommands.parallelCoordinatePanel.onDidDispose(() => MyCommands.parallelCoordinatePanel = undefined);
                }

                const webview = MyCommands.parallelCoordinatePanel.webview;
            }
        };
    }

    private static obtainCloneReport(reportPath: unknown) {
        if (reportPath) {
            return new CloneReport(JSON.parse(fs.readFileSync(reportPath + '/clone_map.json', 'utf8')), JSON.parse(fs.readFileSync(reportPath + '/global_id_map.json', 'utf8')));
        }
        else {
            vscode.window.showErrorMessage('Report Path has not been set.');
        }
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