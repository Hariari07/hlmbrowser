; Standalone NSIS fallback for Linux builders that cannot execute Wine.
; Compile with makensis -DAPP_DIR=<absolute win-unpacked> -DOUTPUT_FILE=<absolute exe>.
Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
Name "HLM Browser"
Icon "../assets/icon.ico"
UninstallIcon "../assets/icon.ico"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\HLM Browser"
RequestExecutionLevel user
SetCompressor zlib
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\HLM Browser.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch HLM Browser"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "HLM Browser requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd
Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}/*"
  WriteUninstaller "$INSTDIR\Uninstall HLM Browser.exe"
  CreateDirectory "$SMPROGRAMS\HLM Browser"
  CreateShortcut "$SMPROGRAMS\HLM Browser\HLM Browser.lnk" "$INSTDIR\HLM Browser.exe"
  CreateShortcut "$DESKTOP\HLM Browser.lnk" "$INSTDIR\HLM Browser.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HLM Browser" "DisplayName" "HLM Browser"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HLM Browser" "DisplayVersion" "1.1.1"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HLM Browser" "UninstallString" '"$INSTDIR\Uninstall HLM Browser.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HLM Browser" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HLM Browser" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HLM Browser" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\HLM Browser.lnk"
  Delete "$SMPROGRAMS\HLM Browser\HLM Browser.lnk"
  RMDir "$SMPROGRAMS\HLM Browser"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HLM Browser"
  ; The application profile is deliberately outside the installation directory.
  RMDir /r "$INSTDIR"
SectionEnd
