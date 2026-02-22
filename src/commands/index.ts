import * as vscode from 'vscode';
import { registerChangelistCommands } from './changelistCommands';
import { registerCommitCommands } from './commitCommands';
import { registerFileCommands } from './fileCommands';
import { registerMiscCommands } from './miscCommands';
import { registerNavigationCommands } from './navigationCommands';
import { registerRevertCommands } from './revertCommands';
import { registerSelectionCommands } from './selectionCommands';
import { registerStashCommands } from './stashCommands';
import { CommandDependencies } from './types';

export { CommandDependencies };

export function registerAllCommands(deps: CommandDependencies): vscode.Disposable[] {
  return [
    ...registerCommitCommands(deps),
    ...registerStashCommands(deps),
    ...registerRevertCommands(deps),
    ...registerChangelistCommands(deps),
    ...registerSelectionCommands(deps),
    ...registerNavigationCommands(),
    ...registerFileCommands(),
    ...registerMiscCommands(deps),
  ];
}
