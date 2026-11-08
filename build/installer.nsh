!macro customInstall
  CreateDirectory "$SMPROGRAMS\Artificiai Launcher"
  CreateShortCut "$DESKTOP\Artificiai Launcher.lnk" "$INSTDIR\Artificiai-Launcher-Bootstrap.exe" "" "$INSTDIR\Artificiai-Launcher-Bootstrap.exe" 0
  CreateShortCut "$SMPROGRAMS\Artificiai Launcher\Artificiai Launcher.lnk" "$INSTDIR\Artificiai-Launcher-Bootstrap.exe" "" "$INSTDIR\Artificiai-Launcher-Bootstrap.exe" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Artificiai Launcher.lnk"
  Delete "$SMPROGRAMS\Artificiai Launcher\Artificiai Launcher.lnk"
  RMDir "$SMPROGRAMS\Artificiai Launcher"
!macroend
