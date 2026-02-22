import * as vscode from 'vscode';
import { CommandDependencies } from './types';
import { registerCommitCommands } from './commitCommands';
import { registerStashCommands } from './stashCommands';
import { registerRevertCommands } from './revertCommands';
import { registerChangelistCommands } from './changelistCommands';
import { registerSelectionCommands } from './selectionCommands';
import { registerNavigationCommands } from './navigationCommands';
import { registerFileCommands } from './fileCommands';
import { registerMiscCommands } from './miscCommands';

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
