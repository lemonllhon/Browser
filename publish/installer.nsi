; Trace Browser NSIS Installer Script
; Usage: makensis /DVERSION=1.1.0 /DSTAGINGDIR=C:\path\to\staging installer.nsi

Unicode True

!ifndef VERSION
  !define VERSION "1.1.0"
!endif
!ifndef STAGINGDIR
  !define STAGINGDIR "..\publish\staging"
!endif

!define PRODUCT_NAME    "Trace Browser"
!define PRODUCT_EXE     "trace-browser.exe"
!define UNINSTALL_KEY   "Software\Microsoft\Windows\CurrentVersion\Uninstall\TraceBrowser"
!define INSTALL_DIR     "$PROGRAMFILES64\Trace Browser"
!ifndef CLEANUPHELPER
  !define CLEANUPHELPER "..\publish\output\trace-installer-cleanup.exe"
!endif

!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifdef BESTCOMPRESSION
  SetCompressor /SOLID lzma
!else
  SetCompressor lzma
!endif

!macro RunCleanupHelper HELPER_PATH EXCLUDE_PATH RETRY_LABEL
  DetailPrint "正在关闭安装目录中的残留进程: $INSTDIR"
  ExecWait '"${HELPER_PATH}" -install-dir "$INSTDIR" -exclude "${EXCLUDE_PATH}" -timeout 10' $2

  ${If} $2 == 0
    Goto done
  ${EndIf}

  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "检测到旧版本仍有进程占用安装目录。$\r$\n$\r$\n目录：$INSTDIR$\r$\n$\r$\n点击“重试”将再次尝试关闭残留进程，点击“取消”将终止本次操作。" IDRETRY ${RETRY_LABEL} IDCANCEL cleanup_abort

cleanup_abort:
  Abort "操作已取消：安装目录中的旧进程仍未退出。"
!macroend

Function CloseInstalledProcesses
  IfFileExists "$INSTDIR" 0 done
  InitPluginsDir
  SetOverwrite on
  File /oname=$PLUGINSDIR\trace-installer-cleanup.exe "${CLEANUPHELPER}"

retry_cleanup:
  !insertmacro RunCleanupHelper "$PLUGINSDIR\trace-installer-cleanup.exe" "" retry_cleanup

done:
  Delete "$PLUGINSDIR\trace-installer-cleanup.exe"
FunctionEnd

Function un.CloseInstalledProcesses
  IfFileExists "$INSTDIR" 0 done
  IfFileExists "$INSTDIR\trace-installer-cleanup.exe" 0 done

retry_cleanup:
  !insertmacro RunCleanupHelper "$INSTDIR\trace-installer-cleanup.exe" "$INSTDIR\Uninstall.exe" retry_cleanup

done:
FunctionEnd

Name "${PRODUCT_NAME} ${VERSION}"
OutFile "..\publish\output\TraceBrowser-Setup-${VERSION}.exe"
InstallDir "${INSTALL_DIR}"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel admin

!define MUI_ICON "..\build\windows\icon.ico"
!define MUI_UNICON "..\build\windows\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!define MUI_COMPONENTSPAGE_SMALLDESC
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Trace Browser"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Section "Trace Browser (required)" SecMain
  SectionIn RO
  Call CloseInstalledProcesses
  SetOutPath "$INSTDIR"
  File "${STAGINGDIR}\${PRODUCT_EXE}"
  File /oname=trace-installer-cleanup.exe "${CLEANUPHELPER}"
!if /FileExists "${STAGINGDIR}\config.yaml"
  IfFileExists "$INSTDIR\config.yaml" +2 0
    File "${STAGINGDIR}\config.yaml"
!else
  !echo "Warning: ${STAGINGDIR}\\config.yaml not found, installer will use runtime defaults."
!endif
!if /FileExists "${STAGINGDIR}\chrome\*"
  SetOutPath "$INSTDIR\chrome"
  File /r "${STAGINGDIR}\chrome\*"
  SetOutPath "$INSTDIR"
!endif
  CreateDirectory "$INSTDIR\data"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName"     "${PRODUCT_NAME}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher"       "Trace Browser Team"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon"     "$INSTDIR\${PRODUCT_EXE}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "NoModify"        "1"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "NoRepair"        "1"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_EXE}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Proxy Runtime (xray / sing-box / mihomo)" SecRuntime
  SectionIn RO
  SetOutPath "$INSTDIR\bin"
  File "${STAGINGDIR}\bin\xray.exe"
  File "${STAGINGDIR}\bin\sing-box.exe"
  File "${STAGINGDIR}\bin\mihomo.exe"
SectionEnd

Section /o "Desktop Shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_EXE}"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain}    "Trace Browser main program and default config (required)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecRuntime} "xray, sing-box and mihomo proxy tools (vless/vmess/hysteria2/Clash YAML)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Create a shortcut on the desktop"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  Call un.CloseInstalledProcesses

  Delete /REBOOTOK "$INSTDIR\${PRODUCT_EXE}"
  Delete /REBOOTOK "$INSTDIR\trace-installer-cleanup.exe"
  Delete /REBOOTOK "$INSTDIR\config.yaml"
  Delete /REBOOTOK "$INSTDIR\proxies.yaml"
  Delete /REBOOTOK "$INSTDIR\Uninstall.exe"
  RMDir /r /REBOOTOK "$INSTDIR\bin"
  RMDir /r /REBOOTOK "$INSTDIR\chrome"
  Delete /REBOOTOK "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete /REBOOTOK "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk"
  RMDir /REBOOTOK "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete /REBOOTOK "$DESKTOP\${PRODUCT_NAME}.lnk"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "是否彻底清理所有用户数据？$\r$\n$\r$\n选择“是”将删除 data 目录（含数据库/实例数据）以及安装目录残留文件。$\r$\n此操作不可恢复。" IDYES un_remove_all_data IDNO un_keep_user_data

un_remove_all_data:
  RMDir /r /REBOOTOK "$INSTDIR\data"
  RMDir /r /REBOOTOK "$INSTDIR\logs"
  RMDir /r /REBOOTOK "$INSTDIR"
  Goto un_done

un_keep_user_data:
  RMDir /REBOOTOK "$INSTDIR"
  Goto un_done

un_done:
  IfFileExists "$INSTDIR\." 0 +2
    MessageBox MB_ICONEXCLAMATION|MB_OK "检测到部分文件仍被占用，已标记为重启后自动删除。"
SectionEnd
