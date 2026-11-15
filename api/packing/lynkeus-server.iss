; SPDX-License-Identifier: AGPL-3.0-only
; Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
; The installer of Lynkeus Server for Windows, for Inno Setup 6.3 or later. ``pack.py`` compiles it with
; /DVersion=<version> after PyInstaller has made the folder ..\dist\Lynkeus Server.
;
; The installer asks for no administrator rights: it installs for the present user, in
; %LOCALAPPDATA%\Programs\Lynkeus Server, and adds an entry to the start menu. Removing the program
; leaves the data folder %LOCALAPPDATA%\Lynkeus with the layers.

#ifndef Version
  #error The version is given as /DVersion=<version>.
#endif

[Setup]
AppId={{6B0E2C0A-5B8D-4E0B-9C55-3E1B0C6F7A41}
AppName=Lynkeus Server
AppVersion={#Version}
AppPublisher=Lynkeus
AppPublisherURL=https://lynkeus.nkua.cloud/
AppSupportURL=https://github.com/AlexandrosLiaskos/lynkeus
DefaultDirName={localappdata}\Programs\Lynkeus Server
DisableDirPage=auto
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=Lynkeus-Server-{#Version}-Windows
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
UninstallDisplayName=Lynkeus Server
LicenseFile=..\..\LICENSE
InfoBeforeFile=..\..\NOTICE

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Files]
Source: "..\dist\Lynkeus Server\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Lynkeus Server"; Filename: "{app}\Lynkeus Server.exe"
Name: "{autodesktop}\Lynkeus Server"; Filename: "{app}\Lynkeus Server.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Lynkeus Server.exe"; Description: "{cm:LaunchProgram,Lynkeus Server}"; Flags: nowait postinstall skipifsilent
