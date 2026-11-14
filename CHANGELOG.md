# Changelog

All notable changes to Lynkeus are recorded in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The site of the project, with the team log as a web page that is generated from its Markdown file.
- The service that counts page visits and stores only their total.
- The files that deploy Lynkeus in containers and publish the team log whenever its file changes.
- The automatic checks of style, types and tests.
- The page of the application, with the ribbon of tools, the map and a choice between two background maps.
- The tabs View, Share and Help of the ribbon, and the buttons of the first functions of every tab.
- The description of each button of the ribbon, shown when the pointer or the keyboard focus rests on it.
- The dialog, the frame of a pane and the messages that every part of the interface uses.
- The formats of a layer description, a layer request and a tool run, in the interface and in the server.
- The tests of the interface, which the automatic checks run.
- The research notes of the parts and the folder of the method sheets.

### Changed

- Each tab of the ribbon is declared in its own folder, and the ribbon joins them.
- The header of the application page shows only the name of the application.

### Removed

- The footer of the application page.
