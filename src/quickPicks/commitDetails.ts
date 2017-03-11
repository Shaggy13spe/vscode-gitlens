'use strict';
import { QuickPickItem, QuickPickOptions, Uri, window } from 'vscode';
import { Commands, Keyboard } from '../commands';
import { GitLogCommit, GitProvider, IGitLog } from '../gitProvider';
import { CommitWithFileStatusQuickPickItem } from './gitQuickPicks';
import { CommandQuickPickItem, getQuickPickIgnoreFocusOut, KeyCommandQuickPickItem, KeyNoopCommandQuickPickItem, OpenFilesCommandQuickPickItem } from './quickPicks';
import * as moment from 'moment';
import * as path from 'path';

export class OpenCommitFilesCommandQuickPickItem extends OpenFilesCommandQuickPickItem {

    constructor(commit: GitLogCommit, item?: QuickPickItem) {
        const repoPath = commit.repoPath;
        const uris = commit.fileStatuses.map(_ => GitProvider.toGitContentUri(commit.sha, _.fileName, repoPath, commit.originalFileName));
        super(uris, item || {
            label: `$(file-symlink-file) Open Changed Files`,
            description: `\u00a0 \u2014 \u00a0\u00a0 in \u00a0$(git-commit) ${commit.shortSha}`
            //detail: `Opens all of the changed files in $(git-commit) ${commit.shortSha}`
        });
    }
}

export class OpenCommitWorkingTreeFilesCommandQuickPickItem extends OpenFilesCommandQuickPickItem {

    constructor(commit: GitLogCommit, versioned: boolean = false, item?: QuickPickItem) {
        const repoPath = commit.repoPath;
        const uris = commit.fileStatuses.map(_ => Uri.file(path.resolve(repoPath, _.fileName)));
        super(uris, item || {
            label: `$(file-symlink-file) Open Changed Working Files`,
            description: undefined
            //detail: `Opens all of the changed file in the working tree`
        });
    }
}

export class CommitDetailsQuickPick {

    static async show(git: GitProvider, commit: GitLogCommit, uri: Uri, goBackCommand?: CommandQuickPickItem, repoLog?: IGitLog): Promise<CommitWithFileStatusQuickPickItem | CommandQuickPickItem | undefined> {
        const items: (CommitWithFileStatusQuickPickItem | CommandQuickPickItem)[] = commit.fileStatuses.map(fs => new CommitWithFileStatusQuickPickItem(commit, fs.fileName, fs.status));

        let index = 0;

        items.splice(index++, 0, new CommandQuickPickItem({
            label: `$(clippy) Copy Commit Sha to Clipboard`,
            description: `\u00a0 \u2014 \u00a0\u00a0 ${commit.shortSha}`
        }, Commands.CopyShaToClipboard, [uri, commit.sha]));

        items.splice(index++, 0, new CommandQuickPickItem({
            label: `$(clippy) Copy Commit Message to Clipboard`,
            description: `\u00a0 \u2014 \u00a0\u00a0 ${commit.message}`
        }, Commands.CopyMessageToClipboard, [uri, commit.sha, commit.message]));

        items.splice(index++, 0, new CommandQuickPickItem({
            label: `$(git-compare) Directory Compare with Previous Commit`,
            description: `\u00a0 \u2014 \u00a0\u00a0 $(git-commit) ${commit.previousShortSha || `${commit.shortSha}^`} \u00a0 $(git-compare) \u00a0 $(git-commit) ${commit.shortSha}`
        }, Commands.DiffDirectory, [commit.uri, commit.previousSha || `${commit.sha}^`, commit.sha]));

        items.splice(index++, 0, new CommandQuickPickItem({
            label: `$(git-compare) Directory Compare with Working Tree`,
            description: `\u00a0 \u2014 \u00a0\u00a0 $(git-commit) ${commit.shortSha} \u00a0 $(git-compare) \u00a0 $(file-directory) Working Tree`
        }, Commands.DiffDirectory, [uri, commit.sha]));

        items.splice(index++, 0, new CommandQuickPickItem({
            label: `Changed Files`,
            description: null
        }, Commands.ShowQuickCommitDetails, [uri, commit.sha, commit, goBackCommand, repoLog]));

        items.push(new OpenCommitFilesCommandQuickPickItem(commit));
        items.push(new OpenCommitWorkingTreeFilesCommandQuickPickItem(commit));

        if (goBackCommand) {
            items.splice(0, 0, goBackCommand);
        }

        const previousCommand = commit.previousSha
            ? new KeyCommandQuickPickItem(Commands.ShowQuickCommitDetails, [commit.previousUri, commit.previousSha, undefined, goBackCommand, repoLog])
            : new KeyNoopCommandQuickPickItem();

        let nextCommand: CommandQuickPickItem | (() => Promise<CommandQuickPickItem>);
        if (repoLog) {
            nextCommand = commit.nextSha
                ? new KeyCommandQuickPickItem(Commands.ShowQuickCommitDetails, [commit.nextUri, commit.nextSha, undefined, goBackCommand, repoLog])
                : new KeyNoopCommandQuickPickItem();
        }
        else {
            nextCommand = async () => {
                const log = await git.getLogForRepo(commit.repoPath, undefined, git.config.advanced.maxQuickHistory);
                const c = log && log.commits.get(commit.sha);
                if (!c) return new KeyNoopCommandQuickPickItem();
                return new KeyCommandQuickPickItem(Commands.ShowQuickCommitDetails, [c.nextUri, c.nextSha, undefined, goBackCommand, log]);
            };
        }

        await Keyboard.instance.enterScope(
            ['left', goBackCommand],
            [',', previousCommand],
            ['.', nextCommand]
        );

        const pick = await window.showQuickPick(items, {
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: `${commit.shortSha} \u2022 ${commit.author}, ${moment(commit.date).fromNow()} \u2022 ${commit.message}`,
            ignoreFocusOut: getQuickPickIgnoreFocusOut(),
            onDidSelectItem: (item: QuickPickItem) => {
                Keyboard.instance.setKeyCommand('right', item);
            }
        } as QuickPickOptions);

        await Keyboard.instance.exitScope();

        return pick;
    }
}