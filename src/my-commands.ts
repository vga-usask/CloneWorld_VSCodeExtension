import * as vscode from 'vscode';
import { CloneReport } from './models/clone-report';
import * as fs from 'fs';
import * as path from 'path';

export class MyCommands {

    static parallelCoordinatePanel: vscode.WebviewPanel | undefined;

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