import React, { useEffect, useState } from "react";
import {
	FieldGroup,
	CheckboxField,
	Button,
	ValidationMessage,
	Paragraph,
	Icon,
} from "@contentful/forma-36-react-components";
import relativeDate from "relative-date";

function Sidebar({ sdk }) {
	const [linksToUpdate, setLinksToUpdate] = useState([]);
	const [linkedEntries, setLinkedEntries] = useState([]);
	const [linkedContentTypes, setLinkedContentTypes] = useState({});
	const [selectAll, setSelectAll] = useState(false);
	const [validSelection, setValidSeclection] = useState(false);
	const [originalEntry, setOriginalEntry] = useState({});
	const [locale, setlocale] = useState("en-US");
	const [entryStatus, setEntryStatus] = useState({
		working: false,
		isDraft: false,
		hasPendingChanges: false,
		isPublished: false,
		lastPublish: null,
	});

	const entryId = sdk.entry.getSys().id;

	// keep track of selected locale
	useEffect(() => {
		sdk.editor.onLocaleSettingsChanged((e) => {
			if (e) {
				setlocale(e.focused);
			}
		});
	}, [sdk.editor, setlocale]);

	// when the current entry changes:
	// store the last published version
	useEffect(() => {
		async function doGetPublishedEntries() {
			try {
				//get orininal entry
				const publishedEntries = await sdk.space.getPublishedEntries({
					"sys.id": entryId,
				});
				if (publishedEntries.total > 0) {
					const entry = publishedEntries.items[0];
					//update state
					setOriginalEntry(entry);
				}
			} catch (e) {
				console.log("error getting entry", e);
			}
		}
		doGetPublishedEntries();
	}, [sdk.space, sdk.entry, entryId]);

	// entry status tracking
	useEffect(() => {
		const detatchFunctions = [];
		detatchFunctions.push(sdk.entry.onSysChanged(sysChanged));

		function sysChanged(e) {
			const sys = sdk.entry.getSys();

			setEntryStatus({
				working: false,
				isDraft: !sys.publishedVersion,
				hasPendingChanges:
					sys.version > (sys.publishedVersion || 0) + 1,
				isPublished: sys.version === (sys.publishedVersion || 0) + 1,
				lastPublish: relativeDate(new Date(sys.updatedAt)),
			});
		}

		return () => {
			detatchFunctions.forEach((detatch) => detatch());
		};
	}, [sdk.entry]);

	//validate linked entries to update selection
	useEffect(() => {
		setValidSeclection(
			linkedEntries.length <= 1 ||
				(linkedEntries.length > 0 && linksToUpdate.length > 0)
		);
	}, [linkedEntries, linksToUpdate]);

	// find all the entries that link to this entry
	useEffect(() => {
		getLinkedEntries();
	}, []);

	// keep `select all` in sync
	useEffect(() => {
		setSelectAll(
			linksToUpdate.length > 0 &&
				linksToUpdate.length === linkedEntries.length
		);
	}, [linksToUpdate]);

	const getLinkedEntries = async () => {
		const entries = await sdk.space.getEntries({
			links_to_entry: sdk.entry.getSys().id,
		});
		//find titles for entries
		if (entries.total > 0) {
			const displayFields = {};

			//find the display field for each entry and add as a property
			const entriesWithTitle = await Promise.all(
				entries.items.map(async (entry) => {
					const contentTypeId = entry.sys.contentType.sys.id;
					// get the content-type if we don't already know
					// the displayField for this content-type
					if (!displayFields[contentTypeId]) {
						const responseEntry = await sdk.space.getContentType(
							contentTypeId
						);
						displayFields[contentTypeId] =
							responseEntry.displayField;

						// store the content type in state so later
						// we can update the link field
						const newContentTypes = { ...linkedContentTypes };
						newContentTypes[contentTypeId] = responseEntry;
						setLinkedContentTypes(newContentTypes);
					}
					// get the locale value for the display field and add to the entry
					const title = entry.fields[displayFields[contentTypeId]];
					const titleLocales = Object.keys(title);
					return {
						...entry,
						displayField: title[titleLocales[0]],
					};
				})
			);

			setLinkedEntries(entriesWithTitle);
		}
	};

	const handlePublish = async () => {
		setEntryStatus({ ...entryStatus, working: true });
		const entryId = sdk.entry.getSys().id;
		let tasks = [];
		if (
			linksToUpdate.length > 0 &&
			linksToUpdate.length < linkedEntries.length
		) {
			//duplicate this entry using the last published data
			const contentTypeId = originalEntry.sys.contentType.sys.id;

			//create new entry draft
			const newEntryDraft = await sdk.space.createEntry(contentTypeId, {
				fields: { ...originalEntry.fields },
			});

			// publish new entry
			const newEntry = await sdk.space.publishEntry(newEntryDraft);

			// save the changes made to this entry
			const updatedEntry = await sdk.space.getEntry(entryId);
			tasks.push(sdk.space.publishEntry({ ...updatedEntry }));

			// now we have the last published version of this entry as newEntry
			// for each page that is not included in the update list
			// replace the link to this entry with a link to the newEntry
			linkedEntries
				.filter((linkedEntry) => {
					return !linksToUpdate.includes(linkedEntry.sys.id);
				})
				.forEach(async (linkedEntry) => {
					// populate with all fields for default values
					// the required fields will be overwritten
					const newFields = { ...linkedEntry.fields };

					//find the field that links to this entry
					Object.keys(linkedEntry.fields).forEach((key) => {
						const field = linkedEntry.fields[key];
						Object.keys(field).forEach((locale) => {
							if (Array.isArray(field[locale])) {
								//go through each array item and check if it links to this entry
								field[locale].forEach((linkedField, index) => {
									if (
										linkedField.sys &&
										linkedField.sys.type === "Link" &&
										linkedField.sys.id === entryId
									) {
										newFields[key][locale][index].sys.id =
											newEntry.sys.id;
									}
								});
							} else {
								const linkedField = field[locale];
								if (
									linkedField.sys &&
									linkedField.sys.type === "Link" &&
									linkedField.sys.id === entryId
								) {
									newFields[key][locale].sys.id =
										newEntry.sys.id;
								}
							}
						});
					});
					// update the linked entry
					const updatedLinkedEntry = {
						...linkedEntry,
						fields: newFields,
					};
					const updated = await sdk.space.updateEntry(
						updatedLinkedEntry
					);
					// publish the updated entry
					await sdk.space.publishEntry(updated);
				});
			//wait untill we have made all the updates then show status notification
			Promise.all(tasks)
				.then((res) => {
					sdk.notifier.success("Entry updated");
				})
				.catch((err) => {
					sdk.notifier.error("Error updating entry");
				})
				.finally(() => {
					setEntryStatus({ ...entryStatus, working: false });
				});
		} else {
			// Do a normal update
			const entry = await sdk.space.getEntry(entryId);
			console.log("orig", entry);
			const newValues = {
				sys: { ...entry.sys, version: entry.sys.version },
				// sys: { id: entry.sys.id, version: entry.sys.version },
				fields: {
					...entry.fields,
				},
			};

			Object.keys(sdk.entry.fields).forEach((key) => {
				const field = sdk.entry.fields[key];
				const value = field.getValue();

				if (value) {
					newValues.fields[key][locale] = value;
				}
			});
			console.log("new vals", newValues);
			// update entry
			const updated = await sdk.space.updateEntry(newValues);

			// publish entry
			sdk.space
				.publishEntry(updated)
				.then((res) => {
					sdk.notifier.success("Entry updated");
				})
				.catch((err) => {
					switch (err.code) {
						case "UnresolvedLinks":
							sdk.notifier.error(
								"Couldn't update entry. Resolve missing links"
							);
							break;

						default:
							sdk.notifier.error("Error updating entry");
							console.log(err);
					}
				})
				.finally(() => {
					setEntryStatus({ ...entryStatus, working: false });
				});
		}
	};

	let result = (
		<div>
			<h1>All clear.</h1>
		</div>
	);

	if (linkedEntries.length > 1) {
		result = (
			<div>
				<h1>Warning:</h1>
				<h5>This entry is used in more than one place</h5>

				<FieldGroup>
					<CheckboxField
						key={"all"}
						labelText={"Select all"}
						name={"all"}
						id={"all"}
						checked={selectAll}
						onChange={(e) => {
							if (e.target.checked) {
								setLinksToUpdate(
									linkedEntries.map((entry) => entry.sys.id)
								);
								setSelectAll(true);
							} else {
								setSelectAll(false);
								setLinksToUpdate([]);
							}
						}}
					/>
					{linkedEntries.map((entry, index) => {
						return (
							<div
								key={entry.sys.id}
								style={{
									display: "flex",
									justifyContent: "space-between",
								}}
							>
								<CheckboxField
									labelText={entry.displayField}
									helpText={entry.sys.contentType.sys.id}
									name={entry.sys.id}
									id={entry.sys.id}
									checked={linksToUpdate.includes(
										entry.sys.id
									)}
									onChange={(e) => {
										if (e.target.checked) {
											setLinksToUpdate([
												...linksToUpdate,
												entry.sys.id,
											]);
										} else {
											setLinksToUpdate(
												linksToUpdate.filter(
													(id) => id !== entry.sys.id
												)
											);
										}
									}}
								/>
								<Icon
									icon="ExternalLink"
									onClick={() => {
										const spaceId = entry.sys.space.sys.id;
										const entryId = entry.sys.id;
										const environmentId =
											entry.sys.environment.sys.id;
										const url = `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}`;
										window.open(url, "_blank");
									}}
								/>
							</div>
						);
					})}
				</FieldGroup>
				{!validSelection ? (
					<ValidationMessage>
						Select entries you want to update
					</ValidationMessage>
				) : null}
			</div>
		);
	}

	const renderStatusLabel = () => {
		if (entryStatus.isDraft) {
			return <span className="f36-color--warning">Draft</span>;
		}

		if (entryStatus.isPublished) {
			return <span className="f36-color--positive">Published</span>;
		}

		return (
			<span className="f36-color--primary">
				Published (pending changes)
			</span>
		);
	};
	return (
		<div>
			{result}

			<Paragraph>
				<strong>Status: </strong>
				{renderStatusLabel()}
			</Paragraph>
			<Button
				className="f36-margin-top--s f36-margin-bottom--xs"
				buttonType="positive"
				onClick={() => {
					handlePublish();
				}}
				disabled={
					!validSelection ||
					entryStatus.working ||
					entryStatus.isPublished
				}
				loading={entryStatus.working}
				isFullWidth={true}
			>
				Publish
			</Button>
			<Paragraph>Last saved {entryStatus.lastPublish}</Paragraph>
		</div>
	);
}
export default Sidebar;
