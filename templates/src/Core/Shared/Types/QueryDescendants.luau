--!strict
--!native
--!optimize 2

-- https://devforum.roblox.com/t/4217847

--[[
	MIT License

	Copyright (c) 2026 Lain

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
]]

-- FYI:
-- 1. This was put together in one day
-- 2. I am unfamiliar with writing lexers, parsers, and type theory
-- So please, do not yell at me, thanks!

-- Luau team, please let me reference instances in type functions
type RobloxClasses = {
   read Accessory: Accessory,
   read AccessoryDescription: AccessoryDescription,
   read AccountService: AccountService,
   read Accoutrement: Accoutrement,
   read AchievementService: AchievementService,
   read ActivityHistoryEventService: ActivityHistoryEventService,
   read Actor: Actor,
   read AdGui: AdGui,
   read AdPortal: AdPortal,
   read AdService: AdService,
   read AdvancedDragger: AdvancedDragger,
   read AirController: AirController,
   read AlignOrientation: AlignOrientation,
   read AlignPosition: AlignPosition,
   read AnalyticsService: AnalyticsService,
   read AngularVelocity: AngularVelocity,
   read Animation: Animation,
   read AnimationClip: AnimationClip,
   read AnimationClipProvider: AnimationClipProvider,
   read AnimationConstraint: AnimationConstraint,
   read AnimationController: AnimationController,
   read AnimationFromVideoCreatorService: AnimationFromVideoCreatorService,
   read AnimationFromVideoCreatorStudioService: AnimationFromVideoCreatorStudioService,
   read AnimationGraphDefinition: AnimationGraphDefinition,
   read AnimationImportData: AnimationImportData,
   read AnimationNode: AnimationNode,
   read AnimationNodeDefinition: AnimationNodeDefinition,
   read AnimationRigData: AnimationRigData,
   read AnimationStreamTrack: AnimationStreamTrack,
   read AnimationTrack: AnimationTrack,
   read Animator: Animator,
   read Annotation: Annotation,
   read AnnotationsService: AnnotationsService,
   read AppLifecycleObserverService: AppLifecycleObserverService,
   read AppRatingPromptService: AppRatingPromptService,
   read AppStorageService: AppStorageService,
   read AppUpdateService: AppUpdateService,
   read ArcHandles: ArcHandles,
   read AssetCounterService: AssetCounterService,
   read AssetDeliveryProxy: AssetDeliveryProxy,
   read AssetImportService: AssetImportService,
   read AssetImportSession: AssetImportSession,
   read AssetManagerService: AssetManagerService,
   read AssetPatchSettings: AssetPatchSettings,
   read AssetQualityService: AssetQualityService,
   read AssetService: AssetService,
   read AssetSoundEffect: AssetSoundEffect,
   read Atmosphere: Atmosphere,
   read AtmosphereSensor: AtmosphereSensor,
   read Attachment: Attachment,
   read AudioAnalyzer: AudioAnalyzer,
   read AudioChannelMixer: AudioChannelMixer,
   read AudioChannelSplitter: AudioChannelSplitter,
   read AudioChorus: AudioChorus,
   read AudioCompressor: AudioCompressor,
   read AudioDeviceInput: AudioDeviceInput,
   read AudioDeviceOutput: AudioDeviceOutput,
   read AudioDistortion: AudioDistortion,
   read AudioEcho: AudioEcho,
   read AudioEmitter: AudioEmitter,
   read AudioEqualizer: AudioEqualizer,
   read AudioFader: AudioFader,
   read AudioFilter: AudioFilter,
   read AudioFlanger: AudioFlanger,
   read AudioFocusService: AudioFocusService,
   read AudioGate: AudioGate,
   read AudioLimiter: AudioLimiter,
   read AudioListener: AudioListener,
   read AudioPages: AudioPages,
   read AudioPitchShifter: AudioPitchShifter,
   read AudioPlayer: AudioPlayer,
   read AudioRecorder: AudioRecorder,
   read AudioReverb: AudioReverb,
   read AudioSearchParams: AudioSearchParams,
   read AudioSpeechToText: AudioSpeechToText,
   read AudioTextToSpeech: AudioTextToSpeech,
   read AudioTremolo: AudioTremolo,
   read AuroraScriptObject: AuroraScriptObject,
   read AuroraScriptService: AuroraScriptService,
   read AuroraService: AuroraService,
   read AvatarAccessoryRules: AvatarAccessoryRules,
   read AvatarAnimationRules: AvatarAnimationRules,
   read AvatarBodyRules: AvatarBodyRules,
   read AvatarChatService: AvatarChatService,
   read AvatarClothingRules: AvatarClothingRules,
   read AvatarCollisionRules: AvatarCollisionRules,
   read AvatarCreationService: AvatarCreationService,
   read AvatarEditorService: AvatarEditorService,
   read AvatarImportService: AvatarImportService,
   read AvatarRules: AvatarRules,
   read AvatarSettings: AvatarSettings,
   read Backpack: Backpack,
   read BackpackItem: BackpackItem,
   read BadgeService: BadgeService,
   read BallSocketConstraint: BallSocketConstraint,
   read BanHistoryPages: BanHistoryPages,
   read BaseImportData: BaseImportData,
   read BasePart: BasePart,
   read BasePlayerGui: BasePlayerGui,
   read BaseRemoteEvent: BaseRemoteEvent,
   read BaseScript: BaseScript,
   read BaseWrap: BaseWrap,
   read Beam: Beam,
   read BevelMesh: BevelMesh,
   read BillboardGui: BillboardGui,
   read BinaryStringValue: BinaryStringValue,
   read BindableEvent: BindableEvent,
   read BindableFunction: BindableFunction,
   read BlockMesh: BlockMesh,
   read BloomEffect: BloomEffect,
   read BlurEffect: BlurEffect,
   read BodyAngularVelocity: BodyAngularVelocity,
   read BodyColors: BodyColors,
   read BodyForce: BodyForce,
   read BodyGyro: BodyGyro,
   read BodyMover: BodyMover,
   read BodyPartDescription: BodyPartDescription,
   read BodyPosition: BodyPosition,
   read BodyThrust: BodyThrust,
   read BodyVelocity: BodyVelocity,
   read Bone: Bone,
   read BoolValue: BoolValue,
   read BoxHandleAdornment: BoxHandleAdornment,
   read Breakpoint: Breakpoint,
   read BrickColorValue: BrickColorValue,
   read BrowserService: BrowserService,
   read BubbleChatConfiguration: BubbleChatConfiguration,
   read BubbleChatMessageProperties: BubbleChatMessageProperties,
   read BugReporterService: BugReporterService,
   read BulkImportService: BulkImportService,
   read BuoyancySensor: BuoyancySensor,
   read CFrameValue: CFrameValue,
   read CSGDictionaryService: CSGDictionaryService,
   read CacheableContentProvider: CacheableContentProvider,
   read CalloutService: CalloutService,
   read Camera: Camera,
   read CanvasGroup: CanvasGroup,
   read Capture: Capture,
   read CaptureService: CaptureService,
   read CapturesPages: CapturesPages,
   read CatalogPages: CatalogPages,
   read ChangeHistoryService: ChangeHistoryService,
   read ChangeHistoryStreamingService: ChangeHistoryStreamingService,
   read ChannelSelectorSoundEffect: ChannelSelectorSoundEffect,
   read ChannelTabsConfiguration: ChannelTabsConfiguration,
   read CharacterAppearance: CharacterAppearance,
   read CharacterMesh: CharacterMesh,
   read Chat: Chat,
   read ChatInputBarConfiguration: ChatInputBarConfiguration,
   read ChatWindowConfiguration: ChatWindowConfiguration,
   read ChatWindowMessageProperties: ChatWindowMessageProperties,
   read ChatbotUIService: ChatbotUIService,
   read ChorusSoundEffect: ChorusSoundEffect,
   read ClickDetector: ClickDetector,
   read ClientReplicator: ClientReplicator,
   read ClimbController: ClimbController,
   read Clothing: Clothing,
   read CloudCRUDService: CloudCRUDService,
   read CloudLocalizationTable: CloudLocalizationTable,
   read Clouds: Clouds,
   read ClusterPacketCache: ClusterPacketCache,
   read Collaborator: Collaborator,
   read CollaboratorsService: CollaboratorsService,
   read CollectionService: CollectionService,
   read Color3Value: Color3Value,
   read ColorCorrectionEffect: ColorCorrectionEffect,
   read ColorGradingEffect: ColorGradingEffect,
   read CommerceService: CommerceService,
   read CompositeValueCurve: CompositeValueCurve,
   read CompressorSoundEffect: CompressorSoundEffect,
   read ConeHandleAdornment: ConeHandleAdornment,
   read ConfigService: ConfigService,
   read ConfigSnapshot: ConfigSnapshot,
   read Configuration: Configuration,
   read ConfigureServerService: ConfigureServerService,
   read ConnectivityService: ConnectivityService,
   read Constraint: Constraint,
   read ContentProvider: ContentProvider,
   read ContextActionService: ContextActionService,
   read Controller: Controller,
   read ControllerBase: ControllerBase,
   read ControllerManager: ControllerManager,
   read ControllerPartSensor: ControllerPartSensor,
   read ControllerSensor: ControllerSensor,
   read ControllerService: ControllerService,
   read ConversationalAIAcceptanceService: ConversationalAIAcceptanceService,
   read CookiesService: CookiesService,
   read CoreGui: CoreGui,
   read CorePackages: CorePackages,
   read CoreScript: CoreScript,
   read CoreScriptDebuggingManagerHelper: CoreScriptDebuggingManagerHelper,
   read CoreScriptSyncService: CoreScriptSyncService,
   read CornerWedgePart: CornerWedgePart,
   read CreationDBService: CreationDBService,
   read CreatorStoreService: CreatorStoreService,
   read CrossDMScriptChangeListener: CrossDMScriptChangeListener,
   read CurveAnimation: CurveAnimation,
   read CustomEvent: CustomEvent,
   read CustomEventReceiver: CustomEventReceiver,
   read CustomLog: CustomLog,
   read CustomSoundEffect: CustomSoundEffect,
   read CylinderHandleAdornment: CylinderHandleAdornment,
   read CylinderMesh: CylinderMesh,
   read CylindricalConstraint: CylindricalConstraint,
   read DataModel: DataModel,
   read DataModelMesh: DataModelMesh,
   read DataModelPatchService: DataModelPatchService,
   read DataModelSession: DataModelSession,
   read DataStore: DataStore,
   read DataStoreGetOptions: DataStoreGetOptions,
   read DataStoreIncrementOptions: DataStoreIncrementOptions,
   read DataStoreInfo: DataStoreInfo,
   read DataStoreKey: DataStoreKey,
   read DataStoreKeyInfo: DataStoreKeyInfo,
   read DataStoreKeyPages: DataStoreKeyPages,
   read DataStoreListingPages: DataStoreListingPages,
   read DataStoreObjectVersionInfo: DataStoreObjectVersionInfo,
   read DataStoreOptions: DataStoreOptions,
   read DataStorePages: DataStorePages,
   read DataStoreService: DataStoreService,
   read DataStoreSetOptions: DataStoreSetOptions,
   read DataStoreVersionPages: DataStoreVersionPages,
   read Debris: Debris,
   read DebuggablePluginWatcher: DebuggablePluginWatcher,
   read DebuggerBreakpoint: DebuggerBreakpoint,
   read DebuggerConnection: DebuggerConnection,
   read DebuggerConnectionManager: DebuggerConnectionManager,
   read DebuggerLuaResponse: DebuggerLuaResponse,
   read DebuggerManager: DebuggerManager,
   read DebuggerUIService: DebuggerUIService,
   read DebuggerVariable: DebuggerVariable,
   read DebuggerWatch: DebuggerWatch,
   read Decal: Decal,
   read DepthOfFieldEffect: DepthOfFieldEffect,
   read DeviceIdService: DeviceIdService,
   read Dialog: Dialog,
   read DialogChoice: DialogChoice,
   read DistortionSoundEffect: DistortionSoundEffect,
   read DockWidgetPluginGui: DockWidgetPluginGui,
   read DoubleConstrainedValue: DoubleConstrainedValue,
   read DraftsService: DraftsService,
   read DragDetector: DragDetector,
   read Dragger: Dragger,
   read DraggerService: DraggerService,
   read DynamicRotate: DynamicRotate,
   read EchoSoundEffect: EchoSoundEffect,
   read EditableImage: EditableImage,
   read EditableMesh: EditableMesh,
   read EditableService: EditableService,
   read EmotesPages: EmotesPages,
   read EncodingService: EncodingService,
   read EqualizerSoundEffect: EqualizerSoundEffect,
   read EulerRotationCurve: EulerRotationCurve,
   read EventIngestService: EventIngestService,
   read ExampleV2Service: ExampleV2Service,
   read ExecutedRemoteCommand: ExecutedRemoteCommand,
   read ExperienceAuthService: ExperienceAuthService,
   read ExperienceInviteOptions: ExperienceInviteOptions,
   read ExperienceNotificationService: ExperienceNotificationService,
   read ExperienceService: ExperienceService,
   read ExperienceStateCaptureService: ExperienceStateCaptureService,
   read ExperienceStateRecordingService: ExperienceStateRecordingService,
   read ExplorerFilter: ExplorerFilter,
   read ExplorerFilterAutocompleter: ExplorerFilterAutocompleter,
   read ExplorerServiceVisibilityService: ExplorerServiceVisibilityService,
   read Explosion: Explosion,
   read FaceAnimatorService: FaceAnimatorService,
   read FaceControls: FaceControls,
   read FaceInstance: FaceInstance,
   read FacialAgeEstimationService: FacialAgeEstimationService,
   read FacialAnimationRecordingService: FacialAnimationRecordingService,
   read FacialAnimationStreamingServiceStats: FacialAnimationStreamingServiceStats,
   read FacialAnimationStreamingServiceV2: FacialAnimationStreamingServiceV2,
   read FacialAnimationStreamingSubsessionStats: FacialAnimationStreamingSubsessionStats,
   read FacsImportData: FacsImportData,
   read Feature: Feature,
   read FeatureRestrictionManager: FeatureRestrictionManager,
   read File: File,
   read FileMesh: FileMesh,
   read Fire: Fire,
   read Flag: Flag,
   read FlagStand: FlagStand,
   read FlagStandService: FlagStandService,
   read FlangeSoundEffect: FlangeSoundEffect,
   read FloatCurve: FloatCurve,
   read FloorWire: FloorWire,
   read FluidForceSensor: FluidForceSensor,
   read FlyweightService: FlyweightService,
   read Folder: Folder,
   read ForceField: ForceField,
   read FormFactorPart: FormFactorPart,
   read Frame: Frame,
   read FriendPages: FriendPages,
   read FriendService: FriendService,
   read FunctionalTest: FunctionalTest,
   read GamePassService: GamePassService,
   read GamepadService: GamepadService,
   read GenerationService: GenerationService,
   read GenericChallengeService: GenericChallengeService,
   read Geometry: Geometry,
   read GeometryService: GeometryService,
   read GetTextBoundsParams: GetTextBoundsParams,
   read GlobalDataStore: GlobalDataStore,
   read Glue: Glue,
   read GroundController: GroundController,
   read GroupImportData: GroupImportData,
   read GroupService: GroupService,
   read GuiBase: GuiBase,
   read GuiBase2d: GuiBase2d,
   read GuiBase3d: GuiBase3d,
   read GuiButton: GuiButton,
   read GuiLabel: GuiLabel,
   read GuiMain: GuiMain,
   read GuiObject: GuiObject,
   read GuiService: GuiService,
   read GuidRegistryService: GuidRegistryService,
   read HSRDataContentProvider: HSRDataContentProvider,
   read HandRigDescription: HandRigDescription,
   read HandleAdornment: HandleAdornment,
   read Handles: Handles,
   read HandlesBase: HandlesBase,
   read HapticEffect: HapticEffect,
   read HapticService: HapticService,
   read HarmonyService: HarmonyService,
   read Hat: Hat,
   read HeapProfilerService: HeapProfilerService,
   read HeatmapService: HeatmapService,
   read HeightmapImporterService: HeightmapImporterService,
   read HiddenSurfaceRemovalAsset: HiddenSurfaceRemovalAsset,
   read Highlight: Highlight,
   read HingeConstraint: HingeConstraint,
   read Hint: Hint,
   read Hole: Hole,
   read Hopper: Hopper,
   read HopperBin: HopperBin,
   read HttpRbxApiService: HttpRbxApiService,
   read HttpRequest: HttpRequest,
   read HttpService: HttpService,
   read Humanoid: Humanoid,
   read HumanoidController: HumanoidController,
   read HumanoidDescription: HumanoidDescription,
   read HumanoidRigDescription: HumanoidRigDescription,
   read IKControl: IKControl,
   read ILegacyStudioBridge: ILegacyStudioBridge,
   read IXPService: IXPService,
   read ImageButton: ImageButton,
   read ImageHandleAdornment: ImageHandleAdornment,
   read ImageLabel: ImageLabel,
   read ImportSession: ImportSession,
   read IncrementalPatchBuilder: IncrementalPatchBuilder,
   read InputAction: InputAction,
   read InputBinding: InputBinding,
   read InputContext: InputContext,
   read InputObject: InputObject,
   read InsertService: InsertService,
   read Instance: Instance,
   read InstanceAdornment: InstanceAdornment,
   read InstanceExtensionsService: InstanceExtensionsService,
   read IntConstrainedValue: IntConstrainedValue,
   read IntValue: IntValue,
   read InternalSyncItem: InternalSyncItem,
   read InternalSyncService: InternalSyncService,
   read IntersectOperation: IntersectOperation,
   read InventoryPages: InventoryPages,
   read JointImportData: JointImportData,
   read JointInstance: JointInstance,
   read JointsService: JointsService,
   read KeyboardService: KeyboardService,
   read Keyframe: Keyframe,
   read KeyframeMarker: KeyframeMarker,
   read KeyframeSequence: KeyframeSequence,
   read KeyframeSequenceProvider: KeyframeSequenceProvider,
   read LSPFileSyncService: LSPFileSyncService,
   read LanguageService: LanguageService,
   read LayerCollector: LayerCollector,
   read LegacyStudioBridge: LegacyStudioBridge,
   read Light: Light,
   read Lighting: Lighting,
   read LineForce: LineForce,
   read LineHandleAdornment: LineHandleAdornment,
   read LinearVelocity: LinearVelocity,
   read LinkingService: LinkingService,
   read LiveScriptingService: LiveScriptingService,
   read LiveSyncService: LiveSyncService,
   read LocalDebuggerConnection: LocalDebuggerConnection,
   read LocalScript: LocalScript,
   read LocalStorageService: LocalStorageService,
   read LocalizationService: LocalizationService,
   read LocalizationTable: LocalizationTable,
   read LodDataEntity: LodDataEntity,
   read LodDataService: LodDataService,
   read LogReporterService: LogReporterService,
   read LogService: LogService,
   read LoginService: LoginService,
   read LuaSourceContainer: LuaSourceContainer,
   read LuaWebService: LuaWebService,
   read LuauScriptAnalyzerService: LuauScriptAnalyzerService,
   read MLModelDeliveryService: MLModelDeliveryService,
   read MLService: MLService,
   read MLSession: MLSession,
   read MakeupDescription: MakeupDescription,
   read ManualGlue: ManualGlue,
   read ManualSurfaceJointInstance: ManualSurfaceJointInstance,
   read ManualWeld: ManualWeld,
   read MarkerCurve: MarkerCurve,
   read MarketplaceService: MarketplaceService,
   read MatchmakingService: MatchmakingService,
   read MaterialGenerationService: MaterialGenerationService,
   read MaterialImportData: MaterialImportData,
   read MaterialService: MaterialService,
   read MaterialVariant: MaterialVariant,
   read MemStorageConnection: MemStorageConnection,
   read MemStorageService: MemStorageService,
   read MemoryStoreHashMap: MemoryStoreHashMap,
   read MemoryStoreHashMapPages: MemoryStoreHashMapPages,
   read MemoryStoreQueue: MemoryStoreQueue,
   read MemoryStoreService: MemoryStoreService,
   read MemoryStoreSortedMap: MemoryStoreSortedMap,
   read MeshContentProvider: MeshContentProvider,
   read MeshImportData: MeshImportData,
   read MeshPart: MeshPart,
   read Message: Message,
   read MessageBusConnection: MessageBusConnection,
   read MessageBusService: MessageBusService,
   read MessagingService: MessagingService,
   read MetaBreakpoint: MetaBreakpoint,
   read MetaBreakpointContext: MetaBreakpointContext,
   read MetaBreakpointManager: MetaBreakpointManager,
   read MicroProfilerService: MicroProfilerService,
   read Model: Model,
   read ModerationService: ModerationService,
   read ModuleScript: ModuleScript,
   read Motor: Motor,
   read Motor6D: Motor6D,
   read MotorFeature: MotorFeature,
   read Mouse: Mouse,
   read MouseService: MouseService,
   read MultipleDocumentInterfaceInstance: MultipleDocumentInterfaceInstance,
   read NegateOperation: NegateOperation,
   read NetworkClient: NetworkClient,
   read NetworkMarker: NetworkMarker,
   read NetworkPeer: NetworkPeer,
   read NetworkReplicator: NetworkReplicator,
   read NetworkServer: NetworkServer,
   read NoCollisionConstraint: NoCollisionConstraint,
   read Noise: Noise,
   read NonReplicatedCSGDictionaryService: NonReplicatedCSGDictionaryService,
   read NotificationService: NotificationService,
   read NumberPose: NumberPose,
   read NumberValue: NumberValue,
   read Object: Object,
   read ObjectValue: ObjectValue,
   read OmniRecommendationsService: OmniRecommendationsService,
   read OpenCloudApiV1: OpenCloudApiV1,
   read OpenCloudService: OpenCloudService,
   read OperationGraph: OperationGraph,
   read OrderedDataStore: OrderedDataStore,
   read OutfitPages: OutfitPages,
   read PVAdornment: PVAdornment,
   read PVInstance: PVInstance,
   read PackageLink: PackageLink,
   read PackageService: PackageService,
   read PackageUIService: PackageUIService,
   read Pages: Pages,
   read Pants: Pants,
   read ParabolaAdornment: ParabolaAdornment,
   read Part: Part,
   read PartAdornment: PartAdornment,
   read PartOperation: PartOperation,
   read PartOperationAsset: PartOperationAsset,
   read ParticleEmitter: ParticleEmitter,
   read PartyEmulatorService: PartyEmulatorService,
   read PatchBundlerFileWatch: PatchBundlerFileWatch,
   read PatchMapping: PatchMapping,
   read Path: Path,
   read Path2D: Path2D,
   read PathfindingLink: PathfindingLink,
   read PathfindingModifier: PathfindingModifier,
   read PathfindingService: PathfindingService,
   read PausedState: PausedState,
   read PausedStateBreakpoint: PausedStateBreakpoint,
   read PausedStateException: PausedStateException,
   read PerformanceControlService: PerformanceControlService,
   read PermissionsService: PermissionsService,
   read PhysicsService: PhysicsService,
   read PitchShiftSoundEffect: PitchShiftSoundEffect,
   read PlaceAssetIdsService: PlaceAssetIdsService,
   read PlaceStatsService: PlaceStatsService,
   read PlacesService: PlacesService,
   read Plane: Plane,
   read PlaneConstraint: PlaneConstraint,
   read Platform: Platform,
   read PlatformCloudStorageService: PlatformCloudStorageService,
   read PlatformFriendsService: PlatformFriendsService,
   read Player: Player,
   read PlayerData: PlayerData,
   read PlayerDataRecord: PlayerDataRecord,
   read PlayerDataRecordConfig: PlayerDataRecordConfig,
   read PlayerDataService: PlayerDataService,
   read PlayerEmulatorService: PlayerEmulatorService,
   read PlayerGui: PlayerGui,
   read PlayerHydrationService: PlayerHydrationService,
   read PlayerMouse: PlayerMouse,
   read PlayerScripts: PlayerScripts,
   read PlayerViewService: PlayerViewService,
   read Players: Players,
   read Plugin: Plugin,
   read PluginAction: PluginAction,
   read PluginCapabilities: PluginCapabilities,
   read PluginDebugService: PluginDebugService,
   read PluginDragEvent: PluginDragEvent,
   read PluginGui: PluginGui,
   read PluginGuiService: PluginGuiService,
   read PluginManagementService: PluginManagementService,
   read PluginManager: PluginManager,
   read PluginManagerInterface: PluginManagerInterface,
   read PluginMenu: PluginMenu,
   read PluginMouse: PluginMouse,
   read PluginPolicyService: PluginPolicyService,
   read PluginToolbar: PluginToolbar,
   read PluginToolbarButton: PluginToolbarButton,
   read PointLight: PointLight,
   read PointsService: PointsService,
   read PolicyService: PolicyService,
   read Pose: Pose,
   read PoseBase: PoseBase,
   read PostEffect: PostEffect,
   read PrismaticConstraint: PrismaticConstraint,
   read ProcessInstancePhysicsService: ProcessInstancePhysicsService,
   read ProximityPrompt: ProximityPrompt,
   read ProximityPromptService: ProximityPromptService,
   read PublishService: PublishService,
   read PyramidHandleAdornment: PyramidHandleAdornment,
   read QWidgetPluginGui: QWidgetPluginGui,
   read RTAnimationTracker: RTAnimationTracker,
   read RayValue: RayValue,
   read RbxAnalyticsService: RbxAnalyticsService,
   read RecommendationPages: RecommendationPages,
   read RecommendationService: RecommendationService,
   read ReflectionMetadata: ReflectionMetadata,
   read ReflectionMetadataCallbacks: ReflectionMetadataCallbacks,
   read ReflectionMetadataClass: ReflectionMetadataClass,
   read ReflectionMetadataClasses: ReflectionMetadataClasses,
   read ReflectionMetadataEnum: ReflectionMetadataEnum,
   read ReflectionMetadataEnumItem: ReflectionMetadataEnumItem,
   read ReflectionMetadataEnums: ReflectionMetadataEnums,
   read ReflectionMetadataEvents: ReflectionMetadataEvents,
   read ReflectionMetadataFunctions: ReflectionMetadataFunctions,
   read ReflectionMetadataItem: ReflectionMetadataItem,
   read ReflectionMetadataMember: ReflectionMetadataMember,
   read ReflectionMetadataProperties: ReflectionMetadataProperties,
   read ReflectionMetadataYieldFunctions: ReflectionMetadataYieldFunctions,
   read ReflectionService: ReflectionService,
   read RelativeGui: RelativeGui,
   read RemoteCommandService: RemoteCommandService,
   read RemoteCursorService: RemoteCursorService,
   read RemoteDebuggerServer: RemoteDebuggerServer,
   read RemoteEvent: RemoteEvent,
   read RemoteFunction: RemoteFunction,
   read RenderingTest: RenderingTest,
   read ReplicatedFirst: ReplicatedFirst,
   read ReplicatedStorage: ReplicatedStorage,
   read ReverbSoundEffect: ReverbSoundEffect,
   read RibbonNotificationService: RibbonNotificationService,
   read RigidConstraint: RigidConstraint,
   read RobloxPluginGuiService: RobloxPluginGuiService,
   read RobloxReplicatedStorage: RobloxReplicatedStorage,
   read RobloxSerializableInstance: RobloxSerializableInstance,
   read RobloxServerStorage: RobloxServerStorage,
   read RocketPropulsion: RocketPropulsion,
   read RodConstraint: RodConstraint,
   read RomarkService: RomarkService,
   read RootImportData: RootImportData,
   read RopeConstraint: RopeConstraint,
   read Rotate: Rotate,
   read RotateP: RotateP,
   read RotateV: RotateV,
   read RotationCurve: RotationCurve,
   read RtMessagingService: RtMessagingService,
   read RunService: RunService,
   read RunningAverageItemDouble: RunningAverageItemDouble,
   read RunningAverageItemInt: RunningAverageItemInt,
   read RunningAverageTimeIntervalItem: RunningAverageTimeIntervalItem,
   read RuntimeContentService: RuntimeContentService,
   read RuntimeScriptService: RuntimeScriptService,
   read SafetyService: SafetyService,
   read ScreenGui: ScreenGui,
   read ScreenshotCapture: ScreenshotCapture,
   read ScreenshotHud: ScreenshotHud,
   read Script: Script,
   read ScriptBuilder: ScriptBuilder,
   read ScriptChangeService: ScriptChangeService,
   read ScriptCloneWatcher: ScriptCloneWatcher,
   read ScriptCloneWatcherHelper: ScriptCloneWatcherHelper,
   read ScriptCommitService: ScriptCommitService,
   read ScriptContext: ScriptContext,
   read ScriptDebugger: ScriptDebugger,
   read ScriptDocument: ScriptDocument,
   read ScriptEditorService: ScriptEditorService,
   read ScriptProfilerService: ScriptProfilerService,
   read ScriptRegistrationService: ScriptRegistrationService,
   read ScriptRuntime: ScriptRuntime,
   read ScriptService: ScriptService,
   read ScrollingFrame: ScrollingFrame,
   read Seat: Seat,
   read Selection: Selection,
   read SelectionBox: SelectionBox,
   read SelectionHighlightManager: SelectionHighlightManager,
   read SelectionLasso: SelectionLasso,
   read SelectionPartLasso: SelectionPartLasso,
   read SelectionPointLasso: SelectionPointLasso,
   read SelectionSphere: SelectionSphere,
   read SensorBase: SensorBase,
   read SerializationService: SerializationService,
   read ServerReplicator: ServerReplicator,
   read ServerScriptService: ServerScriptService,
   read ServerStorage: ServerStorage,
   read ServiceProvider: ServiceProvider,
   read ServiceVisibilityService: ServiceVisibilityService,
   read SessionCheckService: SessionCheckService,
   read SessionService: SessionService,
   read SharedTableRegistry: SharedTableRegistry,
   read Shirt: Shirt,
   read ShirtGraphic: ShirtGraphic,
   read SkateboardController: SkateboardController,
   read SkateboardPlatform: SkateboardPlatform,
   read Skin: Skin,
   read Sky: Sky,
   read SlidingBallConstraint: SlidingBallConstraint,
   read SlimAnimationDataEntity: SlimAnimationDataEntity,
   read SlimAnimationReplicationService: SlimAnimationReplicationService,
   read SlimContentProvider: SlimContentProvider,
   read SlimReplicationService: SlimReplicationService,
   read SlimService: SlimService,
   read Smoke: Smoke,
   read SmoothVoxelsUpgraderService: SmoothVoxelsUpgraderService,
   read Snap: Snap,
   read SnippetService: SnippetService,
   read SocialService: SocialService,
   read SolidModelContentProvider: SolidModelContentProvider,
   read Sound: Sound,
   read SoundEffect: SoundEffect,
   read SoundGroup: SoundGroup,
   read SoundService: SoundService,
   read SoundShimService: SoundShimService,
   read Sparkles: Sparkles,
   read SpawnLocation: SpawnLocation,
   read SpawnerService: SpawnerService,
   read SpecialMesh: SpecialMesh,
   read SphereHandleAdornment: SphereHandleAdornment,
   read SpotLight: SpotLight,
   read SpringConstraint: SpringConstraint,
   read StackFrame: StackFrame,
   read StandalonePluginScripts: StandalonePluginScripts,
   read StandardPages: StandardPages,
   read StartPageService: StartPageService,
   read StarterCharacterScripts: StarterCharacterScripts,
   read StarterGear: StarterGear,
   read StarterGui: StarterGui,
   read StarterPack: StarterPack,
   read StarterPlayer: StarterPlayer,
   read StarterPlayerScripts: StarterPlayerScripts,
   read StartupMessageService: StartupMessageService,
   read Stats: Stats,
   read StatsItem: StatsItem,
   read Status: Status,
   read StopWatchReporter: StopWatchReporter,
   read StreamingService: StreamingService,
   read StringValue: StringValue,
   read StudioAssetService: StudioAssetService,
   read StudioAttachment: StudioAttachment,
   read StudioCallout: StudioCallout,
   read StudioCameraService: StudioCameraService,
   read StudioData: StudioData,
   read StudioDeviceEmulatorService: StudioDeviceEmulatorService,
   read StudioObjectBase: StudioObjectBase,
   read StudioPublishService: StudioPublishService,
   read StudioScriptDebugEventListener: StudioScriptDebugEventListener,
   read StudioSdkService: StudioSdkService,
   read StudioService: StudioService,
   read StudioTestService: StudioTestService,
   read StudioTheme: StudioTheme,
   read StudioUserService: StudioUserService,
   read StudioWidget: StudioWidget,
   read StudioWidgetsService: StudioWidgetsService,
   read StyleBase: StyleBase,
   read StyleDerive: StyleDerive,
   read StyleLink: StyleLink,
   read StyleQuery: StyleQuery,
   read StyleRule: StyleRule,
   read StyleSheet: StyleSheet,
   read StylingService: StylingService,
   read SunRaysEffect: SunRaysEffect,
   read SurfaceAppearance: SurfaceAppearance,
   read SurfaceGui: SurfaceGui,
   read SurfaceGuiBase: SurfaceGuiBase,
   read SurfaceLight: SurfaceLight,
   read SurfaceSelection: SurfaceSelection,
   read SwimController: SwimController,
   read SyncScriptBuilder: SyncScriptBuilder,
   read SystemThemeService: SystemThemeService,
   read Team: Team,
   read TeamCreateData: TeamCreateData,
   read TeamCreatePublishService: TeamCreatePublishService,
   read TeamCreateService: TeamCreateService,
   read Teams: Teams,
   read TelemetryService: TelemetryService,
   read TeleportAsyncResult: TeleportAsyncResult,
   read TeleportOptions: TeleportOptions,
   read TeleportService: TeleportService,
   read TemporaryCageMeshProvider: TemporaryCageMeshProvider,
   read TemporaryScriptService: TemporaryScriptService,
   read Terrain: Terrain,
   read TerrainDetail: TerrainDetail,
   read TerrainIterateOperation: TerrainIterateOperation,
   read TerrainModifyOperation: TerrainModifyOperation,
   read TerrainReadOperation: TerrainReadOperation,
   read TerrainRegion: TerrainRegion,
   read TerrainWriteOperation: TerrainWriteOperation,
   read TestService: TestService,
   read TextBox: TextBox,
   read TextBoxService: TextBoxService,
   read TextButton: TextButton,
   read TextChannel: TextChannel,
   read TextChatCommand: TextChatCommand,
   read TextChatConfigurations: TextChatConfigurations,
   read TextChatMessage: TextChatMessage,
   read TextChatMessageProperties: TextChatMessageProperties,
   read TextChatService: TextChatService,
   read TextFilterResult: TextFilterResult,
   read TextFilterTranslatedResult: TextFilterTranslatedResult,
   read TextGenerator: TextGenerator,
   read TextLabel: TextLabel,
   read TextService: TextService,
   read TextSource: TextSource,
   read Texture: Texture,
   read TextureGenerationPartGroup: TextureGenerationPartGroup,
   read TextureGenerationService: TextureGenerationService,
   read TextureGenerationUnwrappingRequest: TextureGenerationUnwrappingRequest,
   read ThirdPartyUserService: ThirdPartyUserService,
   read ThreadState: ThreadState,
   read TimerService: TimerService,
   read ToastNotificationService: ToastNotificationService,
   read Tool: Tool,
   read Torque: Torque,
   read TorsionSpringConstraint: TorsionSpringConstraint,
   read TotalCountTimeIntervalItem: TotalCountTimeIntervalItem,
   read TouchInputService: TouchInputService,
   read TouchTransmitter: TouchTransmitter,
   read TracerService: TracerService,
   read TrackerLodController: TrackerLodController,
   read TrackerStreamAnimation: TrackerStreamAnimation,
   read Trail: Trail,
   read Translator: Translator,
   read TremoloSoundEffect: TremoloSoundEffect,
   read TriangleMeshPart: TriangleMeshPart,
   read TrussPart: TrussPart,
   read TutorialService: TutorialService,
   read Tween: Tween,
   read TweenBase: TweenBase,
   read TweenService: TweenService,
   read UGCAvatarService: UGCAvatarService,
   read UGCValidationService: UGCValidationService,
   read UIAspectRatioConstraint: UIAspectRatioConstraint,
   read UIBase: UIBase,
   read UIComponent: UIComponent,
   read UIConstraint: UIConstraint,
   read UICorner: UICorner,
   read UIDragDetector: UIDragDetector,
   read UIDragDetectorService: UIDragDetectorService,
   read UIFlexItem: UIFlexItem,
   read UIGradient: UIGradient,
   read UIGridLayout: UIGridLayout,
   read UIGridStyleLayout: UIGridStyleLayout,
   read UILayout: UILayout,
   read UIListLayout: UIListLayout,
   read UIPadding: UIPadding,
   read UIPageLayout: UIPageLayout,
   read UIScale: UIScale,
   read UISizeConstraint: UISizeConstraint,
   read UIStroke: UIStroke,
   read UITableLayout: UITableLayout,
   read UITextSizeConstraint: UITextSizeConstraint,
   read UnionOperation: UnionOperation,
   read UniqueIdLookupService: UniqueIdLookupService,
   read UniversalConstraint: UniversalConstraint,
   read UnreliableRemoteEvent: UnreliableRemoteEvent,
   read UnvalidatedAssetService: UnvalidatedAssetService,
   read UserInputService: UserInputService,
   read UserService: UserService,
   read UserStorageService: UserStorageService,
   read VRService: VRService,
   read VRStatusService: VRStatusService,
   read ValueBase: ValueBase,
   read ValueCurve: ValueCurve,
   read Vector3Curve: Vector3Curve,
   read Vector3Value: Vector3Value,
   read VectorForce: VectorForce,
   read VehicleController: VehicleController,
   read VehicleSeat: VehicleSeat,
   read VelocityMotor: VelocityMotor,
   read VersionControlService: VersionControlService,
   read VideoCapture: VideoCapture,
   read VideoCaptureService: VideoCaptureService,
   read VideoDeviceInput: VideoDeviceInput,
   read VideoDisplay: VideoDisplay,
   read VideoFrame: VideoFrame,
   read VideoPlayer: VideoPlayer,
   read VideoSampler: VideoSampler,
   read VideoScreenCaptureService: VideoScreenCaptureService,
   read VideoService: VideoService,
   read ViewportFrame: ViewportFrame,
   read VirtualInputManager: VirtualInputManager,
   read VirtualUser: VirtualUser,
   read VisibilityCheckDispatcher: VisibilityCheckDispatcher,
   read Visit: Visit,
   read VisualizationMode: VisualizationMode,
   read VisualizationModeCategory: VisualizationModeCategory,
   read VisualizationModeService: VisualizationModeService,
   read VoiceChatInternal: VoiceChatInternal,
   read VoiceChatService: VoiceChatService,
   read WebSocketClient: WebSocketClient,
   read WebSocketService: WebSocketService,
   read WebStreamClient: WebStreamClient,
   read WebViewService: WebViewService,
   read WedgePart: WedgePart,
   read Weld: Weld,
   read WeldConstraint: WeldConstraint,
   read Wire: Wire,
   read WireframeHandleAdornment: WireframeHandleAdornment,
   read Workspace: Workspace,
   read WorkspaceAnnotation: WorkspaceAnnotation,
   read WorldModel: WorldModel,
   read WorldRoot: WorldRoot,
   read WrapDeformer: WrapDeformer,
   read WrapLayer: WrapLayer,
   read WrapTarget: WrapTarget,
   read WrapTextureTransfer: WrapTextureTransfer,
}

type GetRobloxClassByName<ClassName> = index<RobloxClasses, ClassName>

type function RawInfer(selector: type): type
   assert(selector:is("singleton"), "Selector must be a string literal")

   local selectorValue = selector:value()
   assert(typeof(selectorValue) == "string", "Selector must be a string")

   -- Class -> Super class relationship
   local RobloxClassRelationship: { [string]: string } = {
      Accessory = "Accoutrement",
      AccessoryDescription = "Instance",
      AccountService = "Instance",
      Accoutrement = "Instance",
      AchievementService = "Instance",
      ActivityHistoryEventService = "Instance",
      Actor = "Model",
      AdGui = "SurfaceGuiBase",
      AdPortal = "Instance",
      AdService = "Instance",
      AdvancedDragger = "Instance",
      AirController = "ControllerBase",
      AlignOrientation = "Constraint",
      AlignPosition = "Constraint",
      AnalyticsService = "Instance",
      AngularVelocity = "Constraint",
      Animation = "Instance",
      AnimationClip = "Instance",
      AnimationClipProvider = "Instance",
      AnimationConstraint = "Constraint",
      AnimationController = "Instance",
      AnimationFromVideoCreatorService = "Instance",
      AnimationFromVideoCreatorStudioService = "Instance",
      AnimationGraphDefinition = "AnimationClip",
      AnimationImportData = "BaseImportData",
      AnimationNode = "Object",
      AnimationNodeDefinition = "Instance",
      AnimationRigData = "Instance",
      AnimationStreamTrack = "Instance",
      AnimationTrack = "Instance",
      Animator = "Instance",
      Annotation = "Instance",
      AnnotationsService = "Instance",
      AppLifecycleObserverService = "Instance",
      AppRatingPromptService = "Instance",
      AppStorageService = "LocalStorageService",
      AppUpdateService = "Instance",
      ArcHandles = "HandlesBase",
      AssetCounterService = "Instance",
      AssetDeliveryProxy = "Instance",
      AssetImportService = "Instance",
      AssetImportSession = "ImportSession",
      AssetManagerService = "Instance",
      AssetPatchSettings = "Instance",
      AssetQualityService = "Instance",
      AssetService = "Instance",
      AssetSoundEffect = "CustomSoundEffect",
      Atmosphere = "Instance",
      AtmosphereSensor = "SensorBase",
      Attachment = "Instance",
      AudioAnalyzer = "Instance",
      AudioChannelMixer = "Instance",
      AudioChannelSplitter = "Instance",
      AudioChorus = "Instance",
      AudioCompressor = "Instance",
      AudioDeviceInput = "Instance",
      AudioDeviceOutput = "Instance",
      AudioDistortion = "Instance",
      AudioEcho = "Instance",
      AudioEmitter = "Instance",
      AudioEqualizer = "Instance",
      AudioFader = "Instance",
      AudioFilter = "Instance",
      AudioFlanger = "Instance",
      AudioFocusService = "Instance",
      AudioGate = "Instance",
      AudioLimiter = "Instance",
      AudioListener = "Instance",
      AudioPages = "Pages",
      AudioPitchShifter = "Instance",
      AudioPlayer = "Instance",
      AudioRecorder = "Instance",
      AudioReverb = "Instance",
      AudioSearchParams = "Instance",
      AudioSpeechToText = "Instance",
      AudioTextToSpeech = "Instance",
      AudioTremolo = "Instance",
      AuroraScriptObject = "Instance",
      AuroraScriptService = "Instance",
      AuroraService = "Instance",
      AvatarAccessoryRules = "Instance",
      AvatarAnimationRules = "Instance",
      AvatarBodyRules = "Instance",
      AvatarChatService = "Instance",
      AvatarClothingRules = "Instance",
      AvatarCollisionRules = "Instance",
      AvatarCreationService = "Instance",
      AvatarEditorService = "Instance",
      AvatarImportService = "Instance",
      AvatarRules = "Instance",
      AvatarSettings = "Instance",
      Backpack = "Instance",
      BackpackItem = "Model",
      BadgeService = "Instance",
      BallSocketConstraint = "Constraint",
      BanHistoryPages = "Pages",
      BaseImportData = "Instance",
      BasePart = "PVInstance",
      BasePlayerGui = "Instance",
      BaseRemoteEvent = "Instance",
      BaseScript = "LuaSourceContainer",
      BaseWrap = "Instance",
      Beam = "Instance",
      BevelMesh = "DataModelMesh",
      BillboardGui = "LayerCollector",
      BinaryStringValue = "ValueBase",
      BindableEvent = "Instance",
      BindableFunction = "Instance",
      BlockMesh = "BevelMesh",
      BloomEffect = "PostEffect",
      BlurEffect = "PostEffect",
      BodyAngularVelocity = "BodyMover",
      BodyColors = "CharacterAppearance",
      BodyForce = "BodyMover",
      BodyGyro = "BodyMover",
      BodyMover = "Instance",
      BodyPartDescription = "Instance",
      BodyPosition = "BodyMover",
      BodyThrust = "BodyMover",
      BodyVelocity = "BodyMover",
      Bone = "Attachment",
      BoolValue = "ValueBase",
      BoxHandleAdornment = "HandleAdornment",
      Breakpoint = "Instance",
      BrickColorValue = "ValueBase",
      BrowserService = "Instance",
      BubbleChatConfiguration = "TextChatConfigurations",
      BubbleChatMessageProperties = "TextChatMessageProperties",
      BugReporterService = "Instance",
      BulkImportService = "Instance",
      BuoyancySensor = "SensorBase",
      CFrameValue = "ValueBase",
      CSGDictionaryService = "FlyweightService",
      CacheableContentProvider = "Instance",
      CalloutService = "Instance",
      Camera = "PVInstance",
      CanvasGroup = "GuiObject",
      Capture = "Object",
      CaptureService = "Instance",
      CapturesPages = "Pages",
      CatalogPages = "Pages",
      ChangeHistoryService = "Instance",
      ChangeHistoryStreamingService = "Instance",
      ChannelSelectorSoundEffect = "CustomSoundEffect",
      ChannelTabsConfiguration = "TextChatConfigurations",
      CharacterAppearance = "Instance",
      CharacterMesh = "CharacterAppearance",
      Chat = "Instance",
      ChatInputBarConfiguration = "TextChatConfigurations",
      ChatWindowConfiguration = "TextChatConfigurations",
      ChatWindowMessageProperties = "TextChatMessageProperties",
      ChatbotUIService = "Instance",
      ChorusSoundEffect = "SoundEffect",
      ClickDetector = "Instance",
      ClientReplicator = "NetworkReplicator",
      ClimbController = "ControllerBase",
      Clothing = "CharacterAppearance",
      CloudCRUDService = "Instance",
      CloudLocalizationTable = "LocalizationTable",
      Clouds = "Instance",
      ClusterPacketCache = "Instance",
      Collaborator = "Instance",
      CollaboratorsService = "Instance",
      CollectionService = "Instance",
      Color3Value = "ValueBase",
      ColorCorrectionEffect = "PostEffect",
      ColorGradingEffect = "PostEffect",
      CommerceService = "Instance",
      CompositeValueCurve = "Instance",
      CompressorSoundEffect = "SoundEffect",
      ConeHandleAdornment = "HandleAdornment",
      ConfigService = "Instance",
      ConfigSnapshot = "Object",
      Configuration = "Instance",
      ConfigureServerService = "Instance",
      ConnectivityService = "Instance",
      Constraint = "Instance",
      ContentProvider = "Instance",
      ContextActionService = "Instance",
      Controller = "Instance",
      ControllerBase = "Instance",
      ControllerManager = "Instance",
      ControllerPartSensor = "ControllerSensor",
      ControllerSensor = "SensorBase",
      ControllerService = "Instance",
      ConversationalAIAcceptanceService = "Instance",
      CookiesService = "Instance",
      CoreGui = "BasePlayerGui",
      CorePackages = "Instance",
      CoreScript = "BaseScript",
      CoreScriptDebuggingManagerHelper = "Instance",
      CoreScriptSyncService = "Instance",
      CornerWedgePart = "BasePart",
      CreationDBService = "Instance",
      CreatorStoreService = "Instance",
      CrossDMScriptChangeListener = "Instance",
      CurveAnimation = "AnimationClip",
      CustomEvent = "Instance",
      CustomEventReceiver = "Instance",
      CustomLog = "Instance",
      CustomSoundEffect = "SoundEffect",
      CylinderHandleAdornment = "HandleAdornment",
      CylinderMesh = "BevelMesh",
      CylindricalConstraint = "SlidingBallConstraint",
      DataModel = "ServiceProvider",
      DataModelMesh = "Instance",
      DataModelPatchService = "Instance",
      DataModelSession = "Instance",
      DataStore = "GlobalDataStore",
      DataStoreGetOptions = "Instance",
      DataStoreIncrementOptions = "Instance",
      DataStoreInfo = "Instance",
      DataStoreKey = "Instance",
      DataStoreKeyInfo = "Instance",
      DataStoreKeyPages = "Pages",
      DataStoreListingPages = "Pages",
      DataStoreObjectVersionInfo = "Instance",
      DataStoreOptions = "Instance",
      DataStorePages = "Pages",
      DataStoreService = "Instance",
      DataStoreSetOptions = "Instance",
      DataStoreVersionPages = "Pages",
      Debris = "Instance",
      DebuggablePluginWatcher = "Instance",
      DebuggerBreakpoint = "Instance",
      DebuggerConnection = "Instance",
      DebuggerConnectionManager = "Instance",
      DebuggerLuaResponse = "Instance",
      DebuggerManager = "Instance",
      DebuggerUIService = "Instance",
      DebuggerVariable = "Instance",
      DebuggerWatch = "Instance",
      Decal = "FaceInstance",
      DepthOfFieldEffect = "PostEffect",
      DeviceIdService = "Instance",
      Dialog = "Instance",
      DialogChoice = "Instance",
      DistortionSoundEffect = "SoundEffect",
      DockWidgetPluginGui = "PluginGui",
      DoubleConstrainedValue = "ValueBase",
      DraftsService = "Instance",
      DragDetector = "ClickDetector",
      Dragger = "Instance",
      DraggerService = "Instance",
      DynamicRotate = "JointInstance",
      EchoSoundEffect = "SoundEffect",
      EditableImage = "Object",
      EditableMesh = "Object",
      EditableService = "Instance",
      EmotesPages = "InventoryPages",
      EncodingService = "Instance",
      EqualizerSoundEffect = "SoundEffect",
      EulerRotationCurve = "Instance",
      EventIngestService = "Instance",
      ExampleV2Service = "Instance",
      ExecutedRemoteCommand = "Object",
      ExperienceAuthService = "Instance",
      ExperienceInviteOptions = "Instance",
      ExperienceNotificationService = "Instance",
      ExperienceService = "Instance",
      ExperienceStateCaptureService = "Instance",
      ExperienceStateRecordingService = "Instance",
      ExplorerFilter = "Instance",
      ExplorerFilterAutocompleter = "Instance",
      ExplorerServiceVisibilityService = "Instance",
      Explosion = "Instance",
      FaceAnimatorService = "Instance",
      FaceControls = "Instance",
      FaceInstance = "Instance",
      FacialAgeEstimationService = "Instance",
      FacialAnimationRecordingService = "Instance",
      FacialAnimationStreamingServiceStats = "Instance",
      FacialAnimationStreamingServiceV2 = "Instance",
      FacialAnimationStreamingSubsessionStats = "Instance",
      FacsImportData = "BaseImportData",
      Feature = "Instance",
      FeatureRestrictionManager = "Instance",
      File = "Instance",
      FileMesh = "DataModelMesh",
      Fire = "Instance",
      Flag = "Tool",
      FlagStand = "Part",
      FlagStandService = "Instance",
      FlangeSoundEffect = "SoundEffect",
      FloatCurve = "Instance",
      FloorWire = "GuiBase3d",
      FluidForceSensor = "SensorBase",
      FlyweightService = "Instance",
      Folder = "Instance",
      ForceField = "Instance",
      FormFactorPart = "BasePart",
      Frame = "GuiObject",
      FriendPages = "Pages",
      FriendService = "Instance",
      FunctionalTest = "Instance",
      GamePassService = "Instance",
      GamepadService = "Instance",
      GenerationService = "Instance",
      GenericChallengeService = "Instance",
      Geometry = "Instance",
      GeometryService = "Instance",
      GetTextBoundsParams = "Instance",
      GlobalDataStore = "Instance",
      Glue = "JointInstance",
      GroundController = "ControllerBase",
      GroupImportData = "BaseImportData",
      GroupService = "Instance",
      GuiBase = "Instance",
      GuiBase2d = "GuiBase",
      GuiBase3d = "GuiBase",
      GuiButton = "GuiObject",
      GuiLabel = "GuiObject",
      GuiMain = "ScreenGui",
      GuiObject = "GuiBase2d",
      GuiService = "Instance",
      GuidRegistryService = "Instance",
      HSRDataContentProvider = "CacheableContentProvider",
      HandRigDescription = "Instance",
      HandleAdornment = "PVAdornment",
      Handles = "HandlesBase",
      HandlesBase = "PartAdornment",
      HapticEffect = "Instance",
      HapticService = "Instance",
      HarmonyService = "Instance",
      Hat = "Accoutrement",
      HeapProfilerService = "Instance",
      HeatmapService = "Instance",
      HeightmapImporterService = "Instance",
      HiddenSurfaceRemovalAsset = "Instance",
      Highlight = "Instance",
      HingeConstraint = "Constraint",
      Hint = "Message",
      Hole = "Feature",
      Hopper = "Instance",
      HopperBin = "BackpackItem",
      HttpRbxApiService = "Instance",
      HttpRequest = "Instance",
      HttpService = "Instance",
      Humanoid = "Instance",
      HumanoidController = "Controller",
      HumanoidDescription = "Instance",
      HumanoidRigDescription = "Instance",
      IKControl = "Instance",
      ILegacyStudioBridge = "Instance",
      IXPService = "Instance",
      ImageButton = "GuiButton",
      ImageHandleAdornment = "HandleAdornment",
      ImageLabel = "GuiLabel",
      ImportSession = "Instance",
      IncrementalPatchBuilder = "Instance",
      InputAction = "Instance",
      InputBinding = "Instance",
      InputContext = "Instance",
      InputObject = "Instance",
      InsertService = "Instance",
      Instance = "Object",
      InstanceAdornment = "GuiBase3d",
      InstanceExtensionsService = "Instance",
      IntConstrainedValue = "ValueBase",
      IntValue = "ValueBase",
      InternalSyncItem = "Instance",
      InternalSyncService = "Instance",
      IntersectOperation = "PartOperation",
      InventoryPages = "Pages",
      JointImportData = "BaseImportData",
      JointInstance = "Instance",
      JointsService = "Instance",
      KeyboardService = "Instance",
      Keyframe = "Instance",
      KeyframeMarker = "Instance",
      KeyframeSequence = "AnimationClip",
      KeyframeSequenceProvider = "Instance",
      LSPFileSyncService = "Instance",
      LanguageService = "Instance",
      LayerCollector = "GuiBase2d",
      LegacyStudioBridge = "ILegacyStudioBridge",
      Light = "Instance",
      Lighting = "Instance",
      LineForce = "Constraint",
      LineHandleAdornment = "HandleAdornment",
      LinearVelocity = "Constraint",
      LinkingService = "Instance",
      LiveScriptingService = "Instance",
      LiveSyncService = "Instance",
      LocalDebuggerConnection = "DebuggerConnection",
      LocalScript = "Script",
      LocalStorageService = "Instance",
      LocalizationService = "Instance",
      LocalizationTable = "Instance",
      LodDataEntity = "Instance",
      LodDataService = "Instance",
      LogReporterService = "Instance",
      LogService = "Instance",
      LoginService = "Instance",
      LuaSourceContainer = "Instance",
      LuaWebService = "Instance",
      LuauScriptAnalyzerService = "Instance",
      MLModelDeliveryService = "Instance",
      MLService = "Instance",
      MLSession = "Object",
      MakeupDescription = "Instance",
      ManualGlue = "ManualSurfaceJointInstance",
      ManualSurfaceJointInstance = "JointInstance",
      ManualWeld = "ManualSurfaceJointInstance",
      MarkerCurve = "Instance",
      MarketplaceService = "Instance",
      MatchmakingService = "Instance",
      MaterialGenerationService = "Instance",
      MaterialImportData = "BaseImportData",
      MaterialService = "Instance",
      MaterialVariant = "Instance",
      MemStorageConnection = "Instance",
      MemStorageService = "Instance",
      MemoryStoreHashMap = "Instance",
      MemoryStoreHashMapPages = "Pages",
      MemoryStoreQueue = "Instance",
      MemoryStoreService = "Instance",
      MemoryStoreSortedMap = "Instance",
      MeshContentProvider = "CacheableContentProvider",
      MeshImportData = "BaseImportData",
      MeshPart = "TriangleMeshPart",
      Message = "Instance",
      MessageBusConnection = "Instance",
      MessageBusService = "Instance",
      MessagingService = "Instance",
      MetaBreakpoint = "Instance",
      MetaBreakpointContext = "Instance",
      MetaBreakpointManager = "Instance",
      MicroProfilerService = "Instance",
      Model = "PVInstance",
      ModerationService = "Instance",
      ModuleScript = "LuaSourceContainer",
      Motor = "JointInstance",
      Motor6D = "Motor",
      MotorFeature = "Feature",
      Mouse = "Instance",
      MouseService = "Instance",
      MultipleDocumentInterfaceInstance = "Instance",
      NegateOperation = "PartOperation",
      NetworkClient = "NetworkPeer",
      NetworkMarker = "Instance",
      NetworkPeer = "Instance",
      NetworkReplicator = "Instance",
      NetworkServer = "NetworkPeer",
      NoCollisionConstraint = "Instance",
      Noise = "Instance",
      NonReplicatedCSGDictionaryService = "FlyweightService",
      NotificationService = "Instance",
      NumberPose = "PoseBase",
      NumberValue = "ValueBase",
      Object = "nil",
      ObjectValue = "ValueBase",
      OmniRecommendationsService = "Instance",
      OpenCloudApiV1 = "Instance",
      OpenCloudService = "Instance",
      OperationGraph = "Instance",
      OrderedDataStore = "GlobalDataStore",
      OutfitPages = "Pages",
      PVAdornment = "GuiBase3d",
      PVInstance = "Instance",
      PackageLink = "Instance",
      PackageService = "Instance",
      PackageUIService = "Instance",
      Pages = "Instance",
      Pants = "Clothing",
      ParabolaAdornment = "PVAdornment",
      Part = "FormFactorPart",
      PartAdornment = "GuiBase3d",
      PartOperation = "TriangleMeshPart",
      PartOperationAsset = "Instance",
      ParticleEmitter = "Instance",
      PartyEmulatorService = "Instance",
      PatchBundlerFileWatch = "Instance",
      PatchMapping = "Instance",
      Path = "Instance",
      Path2D = "GuiBase",
      PathfindingLink = "Instance",
      PathfindingModifier = "Instance",
      PathfindingService = "Instance",
      PausedState = "Instance",
      PausedStateBreakpoint = "PausedState",
      PausedStateException = "PausedState",
      PerformanceControlService = "Instance",
      PermissionsService = "Instance",
      PhysicsService = "Instance",
      PitchShiftSoundEffect = "SoundEffect",
      PlaceAssetIdsService = "Instance",
      PlaceStatsService = "Instance",
      PlacesService = "Instance",
      Plane = "PlaneConstraint",
      PlaneConstraint = "Constraint",
      Platform = "Part",
      PlatformCloudStorageService = "Instance",
      PlatformFriendsService = "Instance",
      Player = "Instance",
      PlayerData = "Instance",
      PlayerDataRecord = "Instance",
      PlayerDataRecordConfig = "Instance",
      PlayerDataService = "Instance",
      PlayerEmulatorService = "Instance",
      PlayerGui = "BasePlayerGui",
      PlayerHydrationService = "Instance",
      PlayerMouse = "Mouse",
      PlayerScripts = "Instance",
      PlayerViewService = "Instance",
      Players = "Instance",
      Plugin = "Instance",
      PluginAction = "Instance",
      PluginCapabilities = "Instance",
      PluginDebugService = "Instance",
      PluginDragEvent = "Instance",
      PluginGui = "LayerCollector",
      PluginGuiService = "Instance",
      PluginManagementService = "Instance",
      PluginManager = "Instance",
      PluginManagerInterface = "Instance",
      PluginMenu = "Instance",
      PluginMouse = "Mouse",
      PluginPolicyService = "Instance",
      PluginToolbar = "Instance",
      PluginToolbarButton = "Instance",
      PointLight = "Light",
      PointsService = "Instance",
      PolicyService = "Instance",
      Pose = "PoseBase",
      PoseBase = "Instance",
      PostEffect = "Instance",
      PrismaticConstraint = "SlidingBallConstraint",
      ProcessInstancePhysicsService = "Instance",
      ProximityPrompt = "Instance",
      ProximityPromptService = "Instance",
      PublishService = "Instance",
      PyramidHandleAdornment = "HandleAdornment",
      QWidgetPluginGui = "PluginGui",
      RTAnimationTracker = "Instance",
      RayValue = "ValueBase",
      RbxAnalyticsService = "Instance",
      RecommendationPages = "Pages",
      RecommendationService = "Instance",
      ReflectionMetadata = "Instance",
      ReflectionMetadataCallbacks = "Instance",
      ReflectionMetadataClass = "ReflectionMetadataItem",
      ReflectionMetadataClasses = "Instance",
      ReflectionMetadataEnum = "ReflectionMetadataItem",
      ReflectionMetadataEnumItem = "ReflectionMetadataItem",
      ReflectionMetadataEnums = "Instance",
      ReflectionMetadataEvents = "Instance",
      ReflectionMetadataFunctions = "Instance",
      ReflectionMetadataItem = "Instance",
      ReflectionMetadataMember = "ReflectionMetadataItem",
      ReflectionMetadataProperties = "Instance",
      ReflectionMetadataYieldFunctions = "Instance",
      ReflectionService = "Instance",
      RelativeGui = "GuiObject",
      RemoteCommandService = "Instance",
      RemoteCursorService = "Instance",
      RemoteDebuggerServer = "Instance",
      RemoteEvent = "BaseRemoteEvent",
      RemoteFunction = "Instance",
      RenderingTest = "Instance",
      ReplicatedFirst = "Instance",
      ReplicatedStorage = "Instance",
      ReverbSoundEffect = "SoundEffect",
      RibbonNotificationService = "Instance",
      RigidConstraint = "Constraint",
      RobloxPluginGuiService = "Instance",
      RobloxReplicatedStorage = "Instance",
      RobloxSerializableInstance = "Instance",
      RobloxServerStorage = "Instance",
      RocketPropulsion = "BodyMover",
      RodConstraint = "Constraint",
      RomarkService = "Instance",
      RootImportData = "BaseImportData",
      RopeConstraint = "Constraint",
      Rotate = "JointInstance",
      RotateP = "DynamicRotate",
      RotateV = "DynamicRotate",
      RotationCurve = "Instance",
      RtMessagingService = "Instance",
      RunService = "Instance",
      RunningAverageItemDouble = "StatsItem",
      RunningAverageItemInt = "StatsItem",
      RunningAverageTimeIntervalItem = "StatsItem",
      RuntimeContentService = "Instance",
      RuntimeScriptService = "Instance",
      SafetyService = "Instance",
      ScreenGui = "LayerCollector",
      ScreenshotCapture = "Capture",
      ScreenshotHud = "Instance",
      Script = "BaseScript",
      ScriptBuilder = "Instance",
      ScriptChangeService = "Instance",
      ScriptCloneWatcher = "Instance",
      ScriptCloneWatcherHelper = "Instance",
      ScriptCommitService = "Instance",
      ScriptContext = "Instance",
      ScriptDebugger = "Instance",
      ScriptDocument = "Instance",
      ScriptEditorService = "Instance",
      ScriptProfilerService = "Instance",
      ScriptRegistrationService = "Instance",
      ScriptRuntime = "Instance",
      ScriptService = "Instance",
      ScrollingFrame = "GuiObject",
      Seat = "Part",
      Selection = "Instance",
      SelectionBox = "InstanceAdornment",
      SelectionHighlightManager = "Instance",
      SelectionLasso = "GuiBase3d",
      SelectionPartLasso = "SelectionLasso",
      SelectionPointLasso = "SelectionLasso",
      SelectionSphere = "PVAdornment",
      SensorBase = "Instance",
      SerializationService = "Instance",
      ServerReplicator = "NetworkReplicator",
      ServerScriptService = "Instance",
      ServerStorage = "Instance",
      ServiceProvider = "Instance",
      ServiceVisibilityService = "Instance",
      SessionCheckService = "Instance",
      SessionService = "Instance",
      SharedTableRegistry = "Instance",
      Shirt = "Clothing",
      ShirtGraphic = "CharacterAppearance",
      SkateboardController = "Controller",
      SkateboardPlatform = "Part",
      Skin = "CharacterAppearance",
      Sky = "Instance",
      SlidingBallConstraint = "Constraint",
      SlimAnimationDataEntity = "Instance",
      SlimAnimationReplicationService = "Instance",
      SlimContentProvider = "CacheableContentProvider",
      SlimReplicationService = "Instance",
      SlimService = "Instance",
      Smoke = "Instance",
      SmoothVoxelsUpgraderService = "Instance",
      Snap = "JointInstance",
      SnippetService = "Instance",
      SocialService = "Instance",
      SolidModelContentProvider = "CacheableContentProvider",
      Sound = "Instance",
      SoundEffect = "Instance",
      SoundGroup = "Instance",
      SoundService = "Instance",
      SoundShimService = "Instance",
      Sparkles = "Instance",
      SpawnLocation = "Part",
      SpawnerService = "Instance",
      SpecialMesh = "FileMesh",
      SphereHandleAdornment = "HandleAdornment",
      SpotLight = "Light",
      SpringConstraint = "Constraint",
      StackFrame = "Instance",
      StandalonePluginScripts = "Instance",
      StandardPages = "Pages",
      StartPageService = "Instance",
      StarterCharacterScripts = "StarterPlayerScripts",
      StarterGear = "Instance",
      StarterGui = "BasePlayerGui",
      StarterPack = "Instance",
      StarterPlayer = "Instance",
      StarterPlayerScripts = "Instance",
      StartupMessageService = "Instance",
      Stats = "Instance",
      StatsItem = "Instance",
      Status = "Model",
      StopWatchReporter = "Instance",
      StreamingService = "Instance",
      StringValue = "ValueBase",
      StudioAssetService = "Instance",
      StudioAttachment = "Instance",
      StudioCallout = "Instance",
      StudioCameraService = "Instance",
      StudioData = "Instance",
      StudioDeviceEmulatorService = "Instance",
      StudioObjectBase = "Instance",
      StudioPublishService = "Instance",
      StudioScriptDebugEventListener = "Instance",
      StudioSdkService = "Instance",
      StudioService = "Instance",
      StudioTestService = "Instance",
      StudioTheme = "Instance",
      StudioUserService = "Instance",
      StudioWidget = "StudioObjectBase",
      StudioWidgetsService = "Instance",
      StyleBase = "Instance",
      StyleDerive = "Instance",
      StyleLink = "Instance",
      StyleQuery = "Instance",
      StyleRule = "StyleBase",
      StyleSheet = "StyleBase",
      StylingService = "Instance",
      SunRaysEffect = "PostEffect",
      SurfaceAppearance = "Instance",
      SurfaceGui = "SurfaceGuiBase",
      SurfaceGuiBase = "LayerCollector",
      SurfaceLight = "Light",
      SurfaceSelection = "PartAdornment",
      SwimController = "ControllerBase",
      SyncScriptBuilder = "ScriptBuilder",
      SystemThemeService = "Instance",
      Team = "Instance",
      TeamCreateData = "Instance",
      TeamCreatePublishService = "Instance",
      TeamCreateService = "Instance",
      Teams = "Instance",
      TelemetryService = "Instance",
      TeleportAsyncResult = "Instance",
      TeleportOptions = "Instance",
      TeleportService = "Instance",
      TemporaryCageMeshProvider = "Instance",
      TemporaryScriptService = "Instance",
      Terrain = "BasePart",
      TerrainDetail = "Instance",
      TerrainIterateOperation = "Object",
      TerrainModifyOperation = "Object",
      TerrainReadOperation = "Object",
      TerrainRegion = "Instance",
      TerrainWriteOperation = "Object",
      TestService = "Instance",
      TextBox = "GuiObject",
      TextBoxService = "Instance",
      TextButton = "GuiButton",
      TextChannel = "Instance",
      TextChatCommand = "Instance",
      TextChatConfigurations = "Instance",
      TextChatMessage = "Instance",
      TextChatMessageProperties = "Instance",
      TextChatService = "Instance",
      TextFilterResult = "Instance",
      TextFilterTranslatedResult = "Instance",
      TextGenerator = "Instance",
      TextLabel = "GuiLabel",
      TextService = "Instance",
      TextSource = "Instance",
      Texture = "Decal",
      TextureGenerationPartGroup = "Instance",
      TextureGenerationService = "Instance",
      TextureGenerationUnwrappingRequest = "Instance",
      ThirdPartyUserService = "Instance",
      ThreadState = "Instance",
      TimerService = "Instance",
      ToastNotificationService = "Instance",
      Tool = "BackpackItem",
      Torque = "Constraint",
      TorsionSpringConstraint = "Constraint",
      TotalCountTimeIntervalItem = "StatsItem",
      TouchInputService = "Instance",
      TouchTransmitter = "Instance",
      TracerService = "Instance",
      TrackerLodController = "Instance",
      TrackerStreamAnimation = "Instance",
      Trail = "Instance",
      Translator = "Instance",
      TremoloSoundEffect = "SoundEffect",
      TriangleMeshPart = "BasePart",
      TrussPart = "BasePart",
      TutorialService = "Instance",
      Tween = "TweenBase",
      TweenBase = "Instance",
      TweenService = "Instance",
      UGCAvatarService = "Instance",
      UGCValidationService = "Instance",
      UIAspectRatioConstraint = "UIConstraint",
      UIBase = "Instance",
      UIComponent = "UIBase",
      UIConstraint = "UIComponent",
      UICorner = "UIComponent",
      UIDragDetector = "UIComponent",
      UIDragDetectorService = "Instance",
      UIFlexItem = "UIComponent",
      UIGradient = "UIComponent",
      UIGridLayout = "UIGridStyleLayout",
      UIGridStyleLayout = "UILayout",
      UILayout = "UIComponent",
      UIListLayout = "UIGridStyleLayout",
      UIPadding = "UIComponent",
      UIPageLayout = "UIGridStyleLayout",
      UIScale = "UIComponent",
      UISizeConstraint = "UIConstraint",
      UIStroke = "UIComponent",
      UITableLayout = "UIGridStyleLayout",
      UITextSizeConstraint = "UIConstraint",
      UnionOperation = "PartOperation",
      UniqueIdLookupService = "Instance",
      UniversalConstraint = "Constraint",
      UnreliableRemoteEvent = "BaseRemoteEvent",
      UnvalidatedAssetService = "Instance",
      UserInputService = "Instance",
      UserService = "Instance",
      UserStorageService = "LocalStorageService",
      VRService = "Instance",
      VRStatusService = "Instance",
      ValueBase = "Instance",
      ValueCurve = "Instance",
      Vector3Curve = "Instance",
      Vector3Value = "ValueBase",
      VectorForce = "Constraint",
      VehicleController = "Controller",
      VehicleSeat = "BasePart",
      VelocityMotor = "JointInstance",
      VersionControlService = "Instance",
      VideoCapture = "Capture",
      VideoCaptureService = "Instance",
      VideoDeviceInput = "Instance",
      VideoDisplay = "GuiObject",
      VideoFrame = "GuiObject",
      VideoPlayer = "Instance",
      VideoSampler = "Object",
      VideoScreenCaptureService = "Instance",
      VideoService = "Instance",
      ViewportFrame = "GuiObject",
      VirtualInputManager = "Instance",
      VirtualUser = "Instance",
      VisibilityCheckDispatcher = "Instance",
      Visit = "Instance",
      VisualizationMode = "Instance",
      VisualizationModeCategory = "Instance",
      VisualizationModeService = "Instance",
      VoiceChatInternal = "Instance",
      VoiceChatService = "Instance",
      WebSocketClient = "Instance",
      WebSocketService = "Instance",
      WebStreamClient = "Object",
      WebViewService = "Instance",
      WedgePart = "FormFactorPart",
      Weld = "JointInstance",
      WeldConstraint = "Instance",
      Wire = "Instance",
      WireframeHandleAdornment = "HandleAdornment",
      Workspace = "WorldRoot",
      WorkspaceAnnotation = "Annotation",
      WorldModel = "WorldRoot",
      WorldRoot = "Model",
      WrapDeformer = "BaseWrap",
      WrapLayer = "BaseWrap",
      WrapTarget = "BaseWrap",
      WrapTextureTransfer = "Instance",
   }

   --- Returns whether Roblox `ClassName` A is-a `ClassName` B
   local function isA(a: string, b: string): boolean
      local current = a
      while current ~= b do
         local next = RobloxClassRelationship[current]
         if not next then
            return false
         end
         current = next
      end
      return true
   end

   type ColonToken = { read kind: ":" }
   type PeriodToken = { read kind: "." }
   type HashTagToken = { read kind: "#" }
   type DollarSignToken = { read kind: "$" }
   type GreaterThanToken = { read kind: ">" }
   type LeftShiftToken = { read kind: ">>" }
   type EqualToken = { read kind: "=" }
   type OpenParenthesisToken = { read kind: "(" }
   type CloseParenthesisToken = { read kind: ")" }
   type OpenBracketToken = { read kind: "[" }
   type CloseBracketToken = { read kind: "]" }
   type CommaToken = { read kind: "," }
   type WhitespaceToken = { read kind: " " }
   type StringToken = { read kind: "STRING", read content: string }
   type IdentifierToken = { read kind: "IDENTIFIER", read content: string }

   type Token =
      | ColonToken
      | PeriodToken
      | HashTagToken
      | DollarSignToken
      | GreaterThanToken
      | LeftShiftToken
      | WhitespaceToken
      | EqualToken
      | OpenParenthesisToken
      | CloseParenthesisToken
      | OpenBracketToken
      | CloseBracketToken
      | StringToken
      | IdentifierToken
      | CommaToken

   type KeyValue = {
      read key: string,
      read value: string?, -- User may be only checking for existence
   }

   type CombinatorNode = {
      read kind: "COMBINATOR",
      read type: "CHILD" | "DESCENDANT", -- > | >>
      read left: Node,
      read right: Node,
   }

   type SelectorNode = {
      read kind: "SELECTOR",
      read names: { string }, -- #Name
      read tags: { string }, -- .tagName
      read classNames: { string }, -- BasePart
      read properties: { KeyValue }, -- [key=value]
      read attributes: { KeyValue }, -- [$key=value]
      read HAS: { Node }, -- :has()
      read NOT: { Node }, -- :not()
   }

   type GroupNode = {
      read kind: "GROUP",
      read left: Node,
      read right: Node,
   }

   type Node = | GroupNode | SelectorNode | CombinatorNode

   type AST = {
      read tokens: { Token },
      read len: number,
      pos: number,
   }

   type ParseFn = (self: AST) -> Node

   local function isLowerCaseLetter(char: number): boolean
      return char >= 97 and char <= 122 -- 'abcdefghijklmnopqrstuvwxyz'
   end

   local function isUpperCaseLetter(char: number): boolean
      return char >= 65 and char <= 90 -- 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
   end

   local function isDigit(char: number): boolean
      return char >= 48 and char <= 57 -- '0123456789'
   end

   local function isUnderscore(char: number): boolean
      return char == 95 -- '_'
   end

   local function isDash(char: number): boolean
      return char == 45 -- '-'
   end

   local function isIdentifier(char: number): boolean
      return isLowerCaseLetter(char) or isUpperCaseLetter(char) or isDigit(char) or isUnderscore(char) or isDash(char)
   end

   local function peek(self: AST): Token?
      return self.tokens[self.pos]
   end

   local function skipWhitespace(self: AST): ()
      while self.pos <= self.len do
         local token = peek(self)
         assert(token, "Expected token")

         if token.kind == " " then
            self.pos += 1
            continue
         else
            break
         end
      end
   end

   local function pushToken(tokens: { Token }, token: Token): ()
      table.insert(tokens, token)
   end

   local function tokenize(input: string): { Token }
      local tokens: { Token } = {}
      local chars = string.split(input, "")
      local len, pos = #chars, 1

      while pos <= len do
         local char: string = chars[pos]
         if char == " " then
            pushToken(tokens, { kind = " " })
            pos += 1
         elseif char == "." then
            pushToken(tokens, { kind = "." })
            pos += 1
         elseif char == "#" then
            pushToken(tokens, { kind = "#" })
            pos += 1
         elseif char == "$" then
            pushToken(tokens, { kind = "$" })
            pos += 1
         elseif char == "=" then
            pushToken(tokens, { kind = "=" })
            pos += 1
         elseif char == "[" then
            pushToken(tokens, { kind = "[" })
            pos += 1
         elseif char == "]" then
            pushToken(tokens, { kind = "]" })
            pos += 1
         elseif char == "(" then
            pushToken(tokens, { kind = "(" })
            pos += 1
         elseif char == ")" then
            pushToken(tokens, { kind = ")" })
            pos += 1
         elseif char == ":" then
            pushToken(tokens, { kind = ":" })
            pos += 1
         elseif char == "," then
            pushToken(tokens, { kind = "," })
            pos += 1
         elseif char == ">" then
            if chars[pos + 1] == ">" then
               pushToken(tokens, { kind = ">>" })
               pos += 2
            else
               pushToken(tokens, { kind = ">" })
               pos += 1
            end
         elseif char == '"' then
            pos += 1
            local string: string = ""
            while pos <= len do
               local nextChar = chars[pos]
               pos += 1
               if nextChar ~= '"' then
                  string ..= nextChar
               else
                  break
               end
            end
            pushToken(tokens, { kind = "STRING", content = string })
         elseif isIdentifier(string.byte(char)) then
            pos += 1
            local identifier: string = char
            while pos <= len do
               local nextChar = chars[pos]
               if isIdentifier(string.byte(nextChar)) then
                  pos += 1
                  identifier ..= nextChar
               else
                  break
               end
            end
            pushToken(tokens, { kind = "IDENTIFIER", content = identifier })
         else
            error(string.format("Encountered unexpected token '%s' at %d while tokenizing", char, pos))
         end
      end

      return tokens
   end

   local parseSelector: ParseFn
   local parseGroup: ParseFn

   local function parseAttributeValue(self: AST): string
      local value = peek(self)
      assert(value, "Expected either IDENTIFIER or STRING")
      self.pos += 1

      if value.kind == "IDENTIFIER" or value.kind == "STRING" then
         return value.content
      else
         error("Expected either IDENTIFIER or STRING")
      end
   end

   -- There is definitely a better way to implement this function
   -- but it works, so that's all what matters to me at the moment
   parseSelector = function(self: AST): Node
      -- selene: allow(shadowing)
      local selector: SelectorNode = {
         kind = "SELECTOR",
         names = {},
         attributes = {},
         classNames = {},
         properties = {},
         tags = {},
         HAS = {},
         NOT = {},
      }

      while self.pos <= self.len do
         local token = peek(self)
         assert(token, "Expected token")
         if token.kind == " " then
            self.pos += 1 -- Skip whitespace
         elseif token.kind == "IDENTIFIER" then -- Class name
            self.pos += 1
            table.insert(selector.classNames, token.content)
         elseif token.kind == "#" then -- Name
            self.pos += 1
            local nextToken = peek(self)
            assert(nextToken and nextToken.kind == "IDENTIFIER", "Expected IDENTIFIER")
            table.insert(selector.names, nextToken.content)
            self.pos += 1
         elseif token.kind == "." then -- Tag
            self.pos += 1
            local nextToken = peek(self)
            assert(nextToken and nextToken.kind == "IDENTIFIER", "Expected IDENTIFIER")
            table.insert(selector.tags, nextToken.content)
            self.pos += 1
         elseif token.kind == "[" then -- Property or attribute
            self.pos += 1

            skipWhitespace(self)

            local attributeMarker = peek(self)
            assert(attributeMarker, "Expected either IDENTIFIER or '$'")
            local destination: { KeyValue }
            if attributeMarker.kind == "$" then
               self.pos += 1
               destination = selector.attributes
            else
               destination = selector.properties
            end

            local name = peek(self)
            assert(name and name.kind == "IDENTIFIER", "Expected IDENTIFIER")
            self.pos += 1

            skipWhitespace(self)

            local keyValue: KeyValue

            local equal = peek(self)
            assert(equal, "Expected either '=' or ']'")
            if equal.kind == "=" then
               self.pos += 1

               skipWhitespace(self)

               keyValue = { key = name.content, value = parseAttributeValue(self) } :: KeyValue
            else
               keyValue = { key = name.content } :: KeyValue
            end

            skipWhitespace(self)

            local closing = peek(self)
            assert(closing and closing.kind == "]", "Expected ']'")
            self.pos += 1

            table.insert(destination, keyValue)
         elseif token.kind == ":" then -- Pseudo-class filter
            self.pos += 1

            local pseudo = peek(self)
            assert(pseudo and pseudo.kind == "IDENTIFIER", "Expected identifier")
            local destination: { Node }
            if pseudo.content == "has" then
               destination = selector.HAS
            elseif pseudo.content == "not" then
               destination = selector.NOT
            else
               error(string.format("Pseudo-class '%s' filter is not supported", pseudo.content))
            end

            self.pos += 1

            skipWhitespace(self)

            local openParent = peek(self)
            assert(openParent and openParent.kind == "(", "Expected '('")
            self.pos += 1

            skipWhitespace(self)

            local inner = parseGroup(self)

            -- skipWhitespace(self)

            local closeParent = peek(self)
            assert(closeParent and closeParent.kind == ")", "Expected '('")
            self.pos += 1

            table.insert(destination, inner)
         elseif token.kind == ">" then
            self.pos += 1

            local combinator: CombinatorNode = {
               kind = "COMBINATOR",
               type = "CHILD",
               left = selector,
               right = parseGroup(self),
            }

            return combinator
         elseif token.kind == ">>" then
            self.pos += 1

            local combinator: CombinatorNode = {
               kind = "COMBINATOR",
               type = "DESCENDANT",
               left = selector,
               right = parseGroup(self),
            }

            return combinator
         else
            -- I am not sure what to do here, but it works
            break
         end
      end

      return selector
   end

   parseGroup = function(self: AST): Node
      local left = parseSelector(self)
      while self.pos <= self.len do
         local token = peek(self)
         assert(token, "Expected token")
         if token.kind == " " then
            self.pos += 1
         elseif token.kind == "," then
            self.pos += 1
            local group: GroupNode = {
               kind = "GROUP",
               left = left,
               right = parseGroup(self),
            }
            return group
         else
            break
         end
      end
      return left
   end

   local function parse(input: { Token }): Node
      return parseGroup {
         tokens = input,
         len = #input,
         pos = 1,
      }
   end

   local function getClassName(node: SelectorNode): string?
      -- I need to figure out what exactly needs to happen
      -- when there are multiple class names involved
      -- for now I am just going to use the first one
      return node.classNames[1]
   end

   local function checkedGetRobloxClassByName(className: string): type
      if RobloxClassRelationship[className] then
         -- selene: allow(undefined_variable)
         return GetRobloxClassByName(types.singleton(className))
      else
         error(string.format("'%s' is not a valid Roblox instance", className))
      end
   end

   local function gatherSelectorNodes(node: Node, collection: { SelectorNode }): ()
      if node.kind == "SELECTOR" then
         table.insert(collection, node)
      elseif node.kind == "GROUP" then
         gatherSelectorNodes(node.left, collection)
         gatherSelectorNodes(node.right, collection)
      end
   end

   local function infer(node: Node): type
      if node.kind == "GROUP" then
         -- [left], [right]
         return types.unionof(infer(node.left), infer(node.right))
      elseif node.kind == "SELECTOR" then
         local className = getClassName(node)
         local inferredClasses: { type } = { checkedGetRobloxClassByName(className or "Instance") }

         -- Apply exclusion (AKA `:not`) rule

         local collection: { SelectorNode } = {}
         for _, child in node.NOT do
            gatherSelectorNodes(child, collection)
         end

         for _, other in collection do
            local otherClassName = getClassName(other)
            if otherClassName then -- Only check if class names are present
               if className and isA(className, otherClassName) then
                  -- If selector accepts Part but then demands that it does
                  -- NOT accept itself (BasePart, Part, etc), infer the class
                  -- to be never because no match will ever be found; basically
                  -- you will always get an empty array from this (node) selector in particular
                  return types.never
               else
                  -- Exclude a class from the result. For example: BasePart:not(Part)
                  -- will produce ~Part, which means that Part will never be included
                  -- in the result from this (node) selector in particular
                  table.insert(inferredClasses, types.negationof(checkedGetRobloxClassByName(otherClassName)))
               end
            end

            -- TODO: Names, tags, and attributes could be included in the future, but for now this will do
         end

         return if #inferredClasses == 1
            -- For whatever reason, only Studio complains that
            -- intersectionof must take at least two items
            then inferredClasses[1]
            -- Let the type checker do the rest of the work
            else types.intersectionof(unpack(inferredClasses))
      else
         -- left >> [right]
         -- left > [right]
         return infer(node.right)
      end
   end

   return infer(parse(tokenize(selectorValue)))
end

export type Infer<Selector> = { RawInfer<Selector> }

local function QueryDescendants<Selector>(instance: Instance, selector: Selector): Infer<Selector>
   return instance:QueryDescendants(selector) :: Infer<Selector>
end

return QueryDescendants
