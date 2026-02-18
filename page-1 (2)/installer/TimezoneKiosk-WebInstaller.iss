; ============================================================
; Timezone Kiosk Web Installer
; Lightweight installer that downloads components from server
; Size: ~3-5 MB (downloads PostgreSQL, Node.js, App during install)
; ============================================================

#define MyAppName "Timezone Kiosk"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Timezone"
#define MyAppExeName "START_KIOSK.vbs"
#define MyAppIcon "timezone-icon.ico"

; ============================================================
; DOWNLOAD URLs - UPDATE THESE WITH YOUR ACTUAL URLs
; ============================================================
; PostgreSQL 17 - Official EDB download
#define PostgreSQL_URL "https://get.enterprisedb.com/postgresql/postgresql-17.2-1-windows-x64.exe"

; Node.js 22 LTS - Official download
#define NodeJS_URL "https://nodejs.org/dist/v22.13.0/node-v22.13.0-x64.msi"

; YOUR KIOSK APP - UPDATE THIS URL TO YOUR GOOGLE CLOUD STORAGE URL
; Example: https://storage.googleapis.com/YOUR_BUCKET/timezone-kiosk-app.zip
#define KioskApp_URL "https://storage.googleapis.com/timezone-kiosk-downloads/timezone-kiosk-app.zip"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-TIMEZONE-KIOSK}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://timezone.com
AppSupportURL=https://timezone.com/support
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=output
OutputBaseFilename=TimezoneKiosk-WebSetup-{#MyAppVersion}
SetupIconFile=assets\{#MyAppIcon}
UninstallDisplayIcon={app}\{#MyAppIcon}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
DisableWelcomePage=no

; Installer branding images (optional - remove if you don't have them)
; WizardImageFile=assets\installer-wizard.bmp
; WizardSmallImageFile=assets\installer-header.bmp

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Welcome to Timezone Kiosk Setup
WelcomeLabel2=This will install Timezone Kiosk on your computer.%n%nThe installer will download and install:%n%n• PostgreSQL 17 Database%n• Node.js Runtime%n• Timezone Kiosk Application%n%nPlease ensure you have a stable internet connection.

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"
Name: "startmenu"; Description: "Create a &Start Menu shortcut"; GroupDescription: "Additional icons:"

[Files]
; Small launcher files (bundled in installer - only a few KB)
Source: "scripts\START_KIOSK.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\START_KIOSK.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\STOP_KIOSK.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\create_database.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\init_postgres.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\{#MyAppIcon}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Desktop shortcut
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppIcon}"; Tasks: desktopicon

; Start Menu shortcuts
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppIcon}"; Tasks: startmenu
Name: "{group}\Stop {#MyAppName}"; Filename: "{app}\STOP_KIOSK.bat"; IconFilename: "{app}\{#MyAppIcon}"; Tasks: startmenu
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; Option to launch after installation
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent shellexec

[Code]
const
  INSTALL_PASSWORD = 'Timezone@aisensum';

var
  DownloadPage: TDownloadWizardPage;
  PostgreSQLNeeded, NodeJSNeeded: Boolean;
  PasswordPage: TInputQueryWizardPage;
  PasswordAttempts: Integer;

// ============================================================
// Check if PostgreSQL is already installed
// ============================================================
function IsPostgreSQLInstalled: Boolean;
begin
  Result := FileExists('C:\Program Files\PostgreSQL\17\bin\psql.exe') or
            FileExists('C:\Program Files\PostgreSQL\16\bin\psql.exe') or
            FileExists('C:\Program Files\PostgreSQL\15\bin\psql.exe');
end;

// ============================================================
// Check if Node.js is already installed
// ============================================================
function IsNodeJSInstalled: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/c where node >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
  if not Result then
    Result := FileExists('C:\Program Files\nodejs\node.exe');
end;

// ============================================================
// Download progress callback
// ============================================================
function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Successfully downloaded: %s', [FileName]));
  Result := True;
end;

// ============================================================
// Initialize the wizard - add password page
// ============================================================
procedure InitializeWizard;
begin
  // Create password input page (shown after Welcome page)
  PasswordPage := CreateInputQueryPage(wpWelcome,
    'Installation Password Required',
    'This installation is password protected.',
    'Please enter the installation password to continue:');
  PasswordPage.Add('Password:', True);  // True = password field (shows ****)
  
  PasswordAttempts := 0;
  
  // Create download page
  DownloadPage := CreateDownloadPage(
    'Downloading Components',
    'Please wait while the installer downloads required components...',
    @OnDownloadProgress
  );
end;

// ============================================================
// Handle Next button click - password check & downloads
// ============================================================
function NextButtonClick(CurPageID: Integer): Boolean;
var
  EnteredPassword: String;
begin
  Result := True;
  
  // Password verification on password page
  if CurPageID = PasswordPage.ID then begin
    EnteredPassword := PasswordPage.Values[0];
    if EnteredPassword <> INSTALL_PASSWORD then begin
      PasswordAttempts := PasswordAttempts + 1;
      if PasswordAttempts >= 3 then begin
        MsgBox('Too many incorrect attempts. Installation will now exit.', mbCriticalError, MB_OK);
        WizardForm.Close;
        Result := False;
      end else begin
        MsgBox('Incorrect password. ' + IntToStr(3 - PasswordAttempts) + ' attempts remaining.', mbError, MB_OK);
        Result := False;
      end;
      Exit;
    end;
  end;
  
  if CurPageID = wpReady then begin
    // Check what needs to be installed
    PostgreSQLNeeded := not IsPostgreSQLInstalled;
    NodeJSNeeded := not IsNodeJSInstalled;
    
    DownloadPage.Clear;
    
    // Queue downloads
    if PostgreSQLNeeded then begin
      Log('PostgreSQL not found - will download');
      DownloadPage.Add('{#PostgreSQL_URL}', 'postgresql-17-setup.exe', '');
    end else begin
      Log('PostgreSQL already installed - skipping download');
    end;
    
    if NodeJSNeeded then begin
      Log('Node.js not found - will download');
      DownloadPage.Add('{#NodeJS_URL}', 'node-setup.msi', '');
    end else begin
      Log('Node.js already installed - skipping download');
    end;
    
    // Always download latest app
    DownloadPage.Add('{#KioskApp_URL}', 'kiosk-app.zip', '');
    
    DownloadPage.Show;
    try
      try
        DownloadPage.Download;
        Result := True;
      except
        if DownloadPage.AbortedByUser then begin
          Log('Download aborted by user.');
          Result := False;
        end else begin
          SuppressibleMsgBox(
            'Download failed: ' + AddPeriod(GetExceptionMessage) + #13#10 +
            'Please check your internet connection and try again.',
            mbCriticalError, MB_OK, IDOK
          );
          Result := False;
        end;
      end;
    finally
      DownloadPage.Hide;
    end;
  end;
end;

// ============================================================
// Post-install: Run downloaded installers
// ============================================================
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  AppZipPath: String;
begin
  if CurStep = ssPostInstall then begin
    
    // --------------------------------------------------------
    // Install PostgreSQL if downloaded
    // --------------------------------------------------------
    if FileExists(ExpandConstant('{tmp}\postgresql-17-setup.exe')) then begin
      WizardForm.StatusLabel.Caption := 'Installing PostgreSQL 17 (this may take a few minutes)...';
      WizardForm.StatusLabel.Update;
      
      Log('Installing PostgreSQL 17...');
      // Full unattended install with all required options
      if not Exec(
        ExpandConstant('{tmp}\postgresql-17-setup.exe'),
        '--mode unattended --unattendedmodeui none ' +
        '--superpassword timezone@2025 ' +
        '--servicename postgresql-17 ' +
        '--servicepassword timezone@2025 ' +
        '--serverport 5433 ' +
        '--install_runtimes 1 ' +
        '--enable-components server,commandlinetools ' +
        '--disable-components pgAdmin,stackbuilder',
        '',
        SW_SHOW,
        ewWaitUntilTerminated,
        ResultCode
      ) then begin
        Log('PostgreSQL installation failed with code: ' + IntToStr(ResultCode));
      end else begin
        Log('PostgreSQL installed successfully');
      end;
      
      // Wait for service to be ready
      WizardForm.StatusLabel.Caption := 'Waiting for PostgreSQL service to start...';
      WizardForm.StatusLabel.Update;
      Sleep(8000);
      
      // Verify PostgreSQL is running, if not try to start it
      Log('Checking if PostgreSQL service is running...');
      Exec('cmd.exe', '/c net start postgresql-17', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Sleep(3000);
    end;
    
    // --------------------------------------------------------
    // Install Node.js if downloaded
    // --------------------------------------------------------
    if FileExists(ExpandConstant('{tmp}\node-setup.msi')) then begin
      WizardForm.StatusLabel.Caption := 'Installing Node.js...';
      WizardForm.StatusLabel.Update;
      
      Log('Installing Node.js...');
      if not Exec(
        'msiexec.exe',
        '/i "' + ExpandConstant('{tmp}\node-setup.msi') + '" /qn /norestart',
        '',
        SW_SHOW,
        ewWaitUntilTerminated,
        ResultCode
      ) then begin
        Log('Node.js installation failed with code: ' + IntToStr(ResultCode));
      end else begin
        Log('Node.js installed successfully');
      end;
    end;
    
    // --------------------------------------------------------
    // Extract kiosk app from ZIP
    // --------------------------------------------------------
    AppZipPath := ExpandConstant('{tmp}\kiosk-app.zip');
    if FileExists(AppZipPath) then begin
      WizardForm.StatusLabel.Caption := 'Extracting Kiosk Application...';
      WizardForm.StatusLabel.Update;
      
      Log('Extracting app from: ' + AppZipPath);
      Log('Extracting to: ' + ExpandConstant('{app}'));
      
      // Use PowerShell to extract ZIP
      if not Exec(
        'powershell.exe',
        '-NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path ''' + AppZipPath + ''' -DestinationPath ''' + ExpandConstant('{app}') + ''' -Force"',
        '',
        SW_HIDE,
        ewWaitUntilTerminated,
        ResultCode
      ) then begin
        Log('ZIP extraction failed with code: ' + IntToStr(ResultCode));
      end else begin
        Log('App extracted successfully');
      end;
    end;
    
    // --------------------------------------------------------
    // Create production .env file with correct settings
    // --------------------------------------------------------
    WizardForm.StatusLabel.Caption := 'Creating configuration file...';
    WizardForm.StatusLabel.Update;
    
    Log('Creating .env file with production settings...');
    SaveStringToFile(
      ExpandConstant('{app}\.env'),
      '# Timezone Kiosk Database Configuration' + #13#10 +
      '# Auto-generated by installer' + #13#10 +
      '' + #13#10 +
      'DB_HOST=localhost' + #13#10 +
      'DB_PORT=5433' + #13#10 +
      'DB_NAME=TimeZone' + #13#10 +
      'DB_USER=postgres' + #13#10 +
      'DB_PASSWORD=timezone@2025' + #13#10 +
      'location=kiosk1' + #13#10,
      False
    );
    Log('.env file created');
    
    // --------------------------------------------------------
    // Wait for PostgreSQL service to start
    // --------------------------------------------------------
    WizardForm.StatusLabel.Caption := 'Waiting for database service to start...';
    WizardForm.StatusLabel.Update;
    Sleep(5000); // Wait 5 seconds
    
    // --------------------------------------------------------
    // Create database
    // --------------------------------------------------------
    WizardForm.StatusLabel.Caption := 'Creating TimeZone database...';
    WizardForm.StatusLabel.Update;
    
    Log('Running create_database.bat...');
    Exec(
      ExpandConstant('{app}\create_database.bat'),
      '',
      ExpandConstant('{app}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
    
    // --------------------------------------------------------
    // Install npm dependencies
    // --------------------------------------------------------
    WizardForm.StatusLabel.Caption := 'Installing Node.js dependencies (npm install)...';
    WizardForm.StatusLabel.Update;
    
    Log('Running npm install...');
    Exec(
      'cmd.exe',
      '/c cd /d "' + ExpandConstant('{app}') + '" && npm install',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
    
    WizardForm.StatusLabel.Caption := 'Installation complete!';
    WizardForm.StatusLabel.Update;
    Log('Installation completed successfully');
  end;
end;

// ============================================================
// Uninstall: Stop services
// ============================================================
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then begin
    // Stop the kiosk processes
    Exec('taskkill', '/F /IM node.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('taskkill', '/F /IM electron.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
