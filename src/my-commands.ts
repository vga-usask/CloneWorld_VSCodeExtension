import * as vscode from 'vscode';

export class MyCommands {

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

}