// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import * as path from "path";

import { CordovaProjectHelper } from "./cordovaProjectHelper";
import { findFileInFolderHierarchy } from "./extensionHelper";
import { TelemetryHelper } from "./telemetryHelper";

export class TsdHelper {
	private static CORDOVA_TYPINGS_FOLDERNAME = "CordovaTypings";

	private static CORDOVA_TYPINGS_PATH = findFileInFolderHierarchy(
		__dirname,
		TsdHelper.CORDOVA_TYPINGS_FOLDERNAME,
	);

	private static USER_TYPINGS_FOLDERNAME = "typings";

	/**
	 *   Helper to install type defintion files for Cordova plugins and Ionic projects.
	 *   {typingsFolderPath} - the parent folder where the type definitions need to be installed
	 *   {typeDefsPath} - the relative paths of all plugin type definitions that need to be
	 *   installed (relative to <project_root>\.vscode\typings)
	 */
	public static installTypings(
		typingsFolderPath: string,
		typeDefsPath: string[],
		projectRoot?: string,
	): void {
		const installedTypeDefs: string[] = [];

		TelemetryHelper.generate("addTypings", (generator) => {
			generator.add("addedTypeDefinitions", typeDefsPath, false);

			return Promise.all(
				typeDefsPath.map((relativePath: string) => {
					const src = path.resolve(
						TsdHelper.CORDOVA_TYPINGS_PATH,
						relativePath,
					);

					const dest = path.resolve(typingsFolderPath, relativePath);

					// Check if we've previously copied these typings
					if (CordovaProjectHelper.existsSync(dest)) {
						return Promise.resolve(undefined);
					}

					// Check if the user has these typings somewhere else in his project
					if (projectRoot) {
						// We check for short path (e.g. projectRoot/typings/angular.d.ts) and long path (e.g. projectRoot/typings/angular/angular.d.ts)
						const userTypingsShortPath = path.join(
							projectRoot,
							TsdHelper.USER_TYPINGS_FOLDERNAME,
							path.basename(relativePath),
						);

						const userTypingsLongPath = path.join(
							projectRoot,
							TsdHelper.USER_TYPINGS_FOLDERNAME,
							relativePath,
						);

						if (
							CordovaProjectHelper.existsSync(
								userTypingsShortPath,
							) ||
							CordovaProjectHelper.existsSync(userTypingsLongPath)
						) {
							return Promise.resolve(undefined);
						}
					}

					return (
						TsdHelper.installTypeDefinitionFile(src, dest)
							// Save installed typedef to write them all at once later
							.then(() => installedTypeDefs.push(dest))
					);
				}),
			);
		}).finally(() => {
			if (installedTypeDefs.length === 0) return;

			const typingsFolder = path.resolve(
				projectRoot,
				TsdHelper.USER_TYPINGS_FOLDERNAME,
			);

			const indexFile = path.resolve(
				typingsFolder,
				"cordova-typings.d.ts",
			);

			// Ensure that the 'typings' folder exits; if not, create it
			if (!CordovaProjectHelper.existsSync(typingsFolder)) {
				CordovaProjectHelper.makeDirectoryRecursive(typingsFolder);
			}

			const references = CordovaProjectHelper.existsSync(indexFile)
				? fs.readFileSync(indexFile, "utf8")
				: "";

			const referencesToAdd = installedTypeDefs
				// Do not add references to typedefs that are not exist,
				// this rarely happens if typedef file fails to copy
				.filter((typeDef) => CordovaProjectHelper.existsSync(typeDef))
				.map((typeDef) => path.relative(typingsFolder, typeDef))
				// Avoid adding duplicates if reference already exist in index
				.filter((typeDef) => !references.includes(typeDef))
				.map((typeDef) => `/// <reference path="${typeDef}"/>`);

			if (referencesToAdd.length === 0) return;

			fs.writeFileSync(
				indexFile,
				[references].concat(referencesToAdd).join("\n"),
			);
		});
	}

	public static removeTypings(
		typingsFolderPath: string,
		typeDefsToRemove: string[],
		projectRoot: string,
	): void {
		if (typeDefsToRemove.length === 0) return;

		typeDefsToRemove.forEach((typeDef) => {
			fs.unlink(path.resolve(typingsFolderPath, typeDef), (err) => {
				if (err) console.error(err);
			});
		});

		let references = [];

		const indexFile = path.resolve(
			projectRoot,
			TsdHelper.USER_TYPINGS_FOLDERNAME,
			"cordova-typings.d.ts",
		);

		try {
			references = fs.readFileSync(indexFile, "utf8").split("\n");
		} catch (e) {
			// We failed to read index file - it might not exist of
			// blocked by other process - can't do anything here
			return;
		}

		const referencesToPersist = references.filter(
			(ref) =>
				// Filter out references that we need to delete
				ref &&
				!typeDefsToRemove.some((typedef) => ref.includes(typedef)),
		);

		referencesToPersist.length === 0
			? fs.unlinkSync(indexFile)
			: // Write filtered references back to index file
				fs.writeFileSync(
					indexFile,
					referencesToPersist.join("\n"),
					"utf8",
				);
	}

	private static installTypeDefinitionFile(
		src: string,
		dest: string,
	): Promise<any> {
		// Ensure that the parent folder exits; if not, create the hierarchy of directories
		const parentFolder = path.resolve(dest, "..");

		if (!CordovaProjectHelper.existsSync(parentFolder)) {
			CordovaProjectHelper.makeDirectoryRecursive(parentFolder);
		}

		return CordovaProjectHelper.copyFile(src, dest);
	}
}
