// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SimulateOptions } from "cordova-simulate";
import * as vscode from "vscode";
import * as nls from "vscode-nls";

import { ErrorHelper } from "../common/error/errorHelper";
import { InternalErrorCode } from "../common/error/internalErrorCode";
import { SimulationInfo } from "../common/simulationInfo";
import { CordovaCommandHelper } from "../utils/cordovaCommandHelper";
import { ProjectType } from "../utils/cordovaProjectHelper";
import { TelemetryHelper } from "../utils/telemetryHelper";
import {
	createAdditionalWorkspaceFolder,
	onFolderAdded,
} from "./cordova-extension";
import { ProjectsStorage } from "./projectsStorage";
import { PluginSimulator } from "./simulate";

nls.config({
	messageFormat: nls.MessageFormat.bundle,
	bundleFormat: nls.BundleFormat.standalone,
})();

export class CordovaWorkspaceManager implements vscode.Disposable {
	public pluginSimulator: PluginSimulator;

	public workspaceRoot: vscode.WorkspaceFolder;

	public constructor(
		pluginSimulator: PluginSimulator,
		workspaceRoot: vscode.WorkspaceFolder,
	) {
		this.workspaceRoot = workspaceRoot;

		this.pluginSimulator = pluginSimulator;
	}

	public static getWorkspaceManagerByProjectRootPath(
		projectRootPath: string,
	): CordovaWorkspaceManager {
		let workspaceManager =
			ProjectsStorage.projectsCache[projectRootPath.toLowerCase()];

		if (!workspaceManager) {
			const workspaceFolder =
				createAdditionalWorkspaceFolder(projectRootPath);

			if (workspaceFolder) {
				onFolderAdded(workspaceFolder);

				workspaceManager =
					ProjectsStorage.projectsCache[
						workspaceFolder.uri.fsPath.toLowerCase()
					];
			}

			if (!workspaceManager) {
				const error = ErrorHelper.getInternalError(
					InternalErrorCode.CouldNotFindWorkspaceManager,
					projectRootPath,
				);

				TelemetryHelper.sendErrorEvent(
					"CouldNotFindWorkspaceManager",
					error,
				);

				throw error;
			}
		}

		return workspaceManager;
	}

	/**
	 * Stops the server.
	 */
	public dispose(): void {
		if (this.pluginSimulator) {
			this.pluginSimulator.dispose();

			this.pluginSimulator = null;
		}
	}

	/**
	 * Prepares for simulate debugging. The server and simulate host are launched here.
	 * The application host is launched by the debugger.
	 *
	 * Returns info about the running simulate server
	 */
	public simulate(
		fsPath: string,
		simulateOptions: SimulateOptions,
		projectType: ProjectType,
	): Promise<SimulationInfo> {
		return this.launchSimulateServer(
			fsPath,
			simulateOptions,
			projectType,
		).then((simulateInfo: SimulationInfo) => {
			return this.launchSimHost(simulateOptions.target).then(
				() => simulateInfo,
			);
		});
	}

	/**
	 * Launches the simulate server. Only the server is launched here.
	 *
	 * Returns info about the running simulate server
	 */
	public launchSimulateServer(
		fsPath: string,
		simulateOptions: SimulateOptions,
		projectType: ProjectType,
	): Promise<SimulationInfo> {
		return this.pluginSimulator.launchServer(
			fsPath,
			simulateOptions,
			projectType,
		);
	}

	/**
	 * Launches sim-host using an already running simulate server.
	 */
	public launchSimHost(target: string): Promise<void> {
		return this.pluginSimulator.launchSimHost(target);
	}

	/**
	 * Returns the number of currently visible editors.
	 */
	public getVisibleEditorsCount(): Promise<number> {
		// visibleTextEditors is null proof (returns empty array if no editors visible)
		return Promise.resolve(vscode.window.visibleTextEditors.length);
	}

	public getRunArguments(fsPath: string): Promise<string[]> {
		return Promise.resolve(CordovaCommandHelper.getRunArguments(fsPath));
	}

	public getCordovaExecutable(fsPath: string): Promise<string> {
		return Promise.resolve(
			CordovaCommandHelper.getCordovaExecutable(fsPath),
		);
	}
}
