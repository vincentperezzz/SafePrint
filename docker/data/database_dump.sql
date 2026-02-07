-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: SAFEPRINT_DB
-- ------------------------------------------------------
-- Server version	8.0.45-0ubuntu0.24.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admin_users`
--

DROP TABLE IF EXISTS `admin_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL,
  `profile_image` varchar(100) DEFAULT NULL,
  `notification_sound_id` bigint DEFAULT NULL,
  `sound_enabled` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `admin_users_notification_sound_id_79c0d2c1_fk` (`notification_sound_id`),
  CONSTRAINT `admin_users_notification_sound_id_79c0d2c1_fk` FOREIGN KEY (`notification_sound_id`) REFERENCES `notification_sounds` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_users`
--

LOCK TABLES `admin_users` WRITE;
/*!40000 ALTER TABLE `admin_users` DISABLE KEYS */;
INSERT INTO `admin_users` VALUES (2,'Admin','admin','pbkdf2_sha256$1000000$zw0NUeXWkpHdnDB9B7HhI4$biaDHNILx091VabReLDCSeL/moLt7eRGMp99pT6jiT0=','Manager','profile_images/ico_1.png',1,1),(4,'Vincent','@vincentperez','pbkdf2_sha256$1000000$fxI9UutmSMdqgXkUUulqx3$mKX1zkDAPAXqSOKtzcHcYdfBCuYRyUegUmaJl6c0LeE=','admin','',1,1),(5,'Crystal','@crystalinedatu','pbkdf2_sha256$1000000$jLcZbFfvmC6dUJousPASTV$ncrQ3Wp1OTPdg+3LOkLASuhnLUVQ70QzRYXazEKkN+Y=','admin','',3,1),(6,'Charles','@charlesgavino','pbkdf2_sha256$1000000$13ZwPIHjilCuRs3riYpgpr$2es9v/wF/2DKy706D/aRvHS/g+31oAeR4fUz+lRVkXY=','admin','',1,1);
/*!40000 ALTER TABLE `admin_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_group`
--

DROP TABLE IF EXISTS `auth_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_group` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_group`
--

LOCK TABLES `auth_group` WRITE;
/*!40000 ALTER TABLE `auth_group` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_group` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_group_permissions`
--

DROP TABLE IF EXISTS `auth_group_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_group_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_group_permissions_group_id_permission_id_0cd325b0_uniq` (`group_id`,`permission_id`),
  KEY `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` (`permission_id`),
  CONSTRAINT `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`),
  CONSTRAINT `auth_group_permissions_group_id_b120cbf9_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_group_permissions`
--

LOCK TABLES `auth_group_permissions` WRITE;
/*!40000 ALTER TABLE `auth_group_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_group_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_permission`
--

DROP TABLE IF EXISTS `auth_permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `content_type_id` int NOT NULL,
  `codename` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_permission_content_type_id_codename_01ab375a_uniq` (`content_type_id`,`codename`),
  CONSTRAINT `auth_permission_content_type_id_2f476e4b_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_permission`
--

LOCK TABLES `auth_permission` WRITE;
/*!40000 ALTER TABLE `auth_permission` DISABLE KEYS */;
INSERT INTO `auth_permission` VALUES (1,'Can add log entry',1,'add_logentry'),(2,'Can change log entry',1,'change_logentry'),(3,'Can delete log entry',1,'delete_logentry'),(4,'Can view log entry',1,'view_logentry'),(5,'Can add permission',2,'add_permission'),(6,'Can change permission',2,'change_permission'),(7,'Can delete permission',2,'delete_permission'),(8,'Can view permission',2,'view_permission'),(9,'Can add group',3,'add_group'),(10,'Can change group',3,'change_group'),(11,'Can delete group',3,'delete_group'),(12,'Can view group',3,'view_group'),(13,'Can add user',4,'add_user'),(14,'Can change user',4,'change_user'),(15,'Can delete user',4,'delete_user'),(16,'Can view user',4,'view_user'),(17,'Can add content type',5,'add_contenttype'),(18,'Can change content type',5,'change_contenttype'),(19,'Can delete content type',5,'delete_contenttype'),(20,'Can view content type',5,'view_contenttype'),(21,'Can add session',6,'add_session'),(22,'Can change session',6,'change_session'),(23,'Can delete session',6,'delete_session'),(24,'Can view session',6,'view_session'),(25,'Can add admin user',7,'add_adminuser'),(26,'Can change admin user',7,'change_adminuser'),(27,'Can delete admin user',7,'delete_adminuser'),(28,'Can view admin user',7,'view_adminuser'),(29,'Can add document',8,'add_document'),(30,'Can change document',8,'change_document'),(31,'Can delete document',8,'delete_document'),(32,'Can view document',8,'view_document'),(33,'Can add feedback',9,'add_feedback'),(34,'Can change feedback',9,'change_feedback'),(35,'Can delete feedback',9,'delete_feedback'),(36,'Can view feedback',9,'view_feedback'),(37,'Can add printer',10,'add_printer'),(38,'Can change printer',10,'change_printer'),(39,'Can delete printer',10,'delete_printer'),(40,'Can view printer',10,'view_printer'),(41,'Can add payment',11,'add_payment'),(42,'Can change payment',11,'change_payment'),(43,'Can delete payment',11,'delete_payment'),(44,'Can view payment',11,'view_payment'),(45,'Can add Reroute history',12,'add_reroutehistory'),(46,'Can change Reroute history',12,'change_reroutehistory'),(47,'Can delete Reroute history',12,'delete_reroutehistory'),(48,'Can view Reroute history',12,'view_reroutehistory'),(49,'Can add notification sound',13,'add_notificationsound'),(50,'Can change notification sound',13,'change_notificationsound'),(51,'Can delete notification sound',13,'delete_notificationsound'),(52,'Can view notification sound',13,'view_notificationsound');
/*!40000 ALTER TABLE `auth_permission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_user`
--

DROP TABLE IF EXISTS `auth_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `password` varchar(128) NOT NULL,
  `last_login` datetime(6) DEFAULT NULL,
  `is_superuser` tinyint(1) NOT NULL,
  `username` varchar(150) NOT NULL,
  `first_name` varchar(150) NOT NULL,
  `last_name` varchar(150) NOT NULL,
  `email` varchar(254) NOT NULL,
  `is_staff` tinyint(1) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `date_joined` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_user`
--

LOCK TABLES `auth_user` WRITE;
/*!40000 ALTER TABLE `auth_user` DISABLE KEYS */;
INSERT INTO `auth_user` VALUES (1,'pbkdf2_sha256$1000000$Id8HGo3BrrLEtaRXgCfXzh$kTAAHBIr36PlA0ZvQ52ZgjuBE07Dvkr8e4b0KiMMSRw=','2025-11-30 09:54:48.827025',1,'admin','','','admin@admin.com',1,1,'2025-07-09 11:25:48.620799');
/*!40000 ALTER TABLE `auth_user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_user_groups`
--

DROP TABLE IF EXISTS `auth_user_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_user_groups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `group_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_user_groups_user_id_group_id_94350c0c_uniq` (`user_id`,`group_id`),
  KEY `auth_user_groups_group_id_97559544_fk_auth_group_id` (`group_id`),
  CONSTRAINT `auth_user_groups_group_id_97559544_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`),
  CONSTRAINT `auth_user_groups_user_id_6a12ed8b_fk_auth_user_id` FOREIGN KEY (`user_id`) REFERENCES `auth_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_user_groups`
--

LOCK TABLES `auth_user_groups` WRITE;
/*!40000 ALTER TABLE `auth_user_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_user_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_user_user_permissions`
--

DROP TABLE IF EXISTS `auth_user_user_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_user_user_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_user_user_permissions_user_id_permission_id_14a6b632_uniq` (`user_id`,`permission_id`),
  KEY `auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm` (`permission_id`),
  CONSTRAINT `auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`),
  CONSTRAINT `auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id` FOREIGN KEY (`user_id`) REFERENCES `auth_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_user_user_permissions`
--

LOCK TABLES `auth_user_user_permissions` WRITE;
/*!40000 ALTER TABLE `auth_user_user_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_user_user_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `django_admin_log`
--

DROP TABLE IF EXISTS `django_admin_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_admin_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action_time` datetime(6) NOT NULL,
  `object_id` longtext,
  `object_repr` varchar(200) NOT NULL,
  `action_flag` smallint unsigned NOT NULL,
  `change_message` longtext NOT NULL,
  `content_type_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `django_admin_log_content_type_id_c4bce8eb_fk_django_co` (`content_type_id`),
  KEY `django_admin_log_user_id_c564eba6_fk_auth_user_id` (`user_id`),
  CONSTRAINT `django_admin_log_content_type_id_c4bce8eb_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`),
  CONSTRAINT `django_admin_log_user_id_c564eba6_fk_auth_user_id` FOREIGN KEY (`user_id`) REFERENCES `auth_user` (`id`),
  CONSTRAINT `django_admin_log_chk_1` CHECK ((`action_flag` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=73 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `django_admin_log`
--

LOCK TABLES `django_admin_log` WRITE;
/*!40000 ALTER TABLE `django_admin_log` DISABLE KEYS */;
INSERT INTO `django_admin_log` VALUES (1,'2025-07-09 12:18:11.986933','1','Printer 1',1,'[{\"added\": {}}]',10,1),(2,'2025-07-09 12:18:49.794871','2','Printer 2',1,'[{\"added\": {}}]',10,1),(3,'2025-07-09 12:19:34.929577','3','Printer 3',1,'[{\"added\": {}}]',10,1),(4,'2025-07-09 15:15:34.049881','1','manager',3,'',7,1),(5,'2025-07-09 15:44:29.383266','1','Printer 1',1,'[{\"added\": {}}]',10,1),(6,'2025-07-09 15:44:54.970088','2','Printer 2',1,'[{\"added\": {}}]',10,1),(7,'2025-07-09 15:45:34.800039','3','Printer 3',1,'[{\"added\": {}}]',10,1),(8,'2025-07-18 10:47:25.230390','1','Comment by kajan',3,'',9,1),(9,'2025-07-22 16:25:46.079761','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ip address\", \"Node name\"]}}]',10,1),(10,'2025-07-23 09:44:28.492925','2','Printer 2',2,'[{\"changed\": {\"fields\": [\"Printer status\"]}}]',10,1),(11,'2025-07-23 10:02:35.341228','3','Printer 3',3,'',10,1),(12,'2025-07-23 10:02:35.341362','2','Printer 2',3,'',10,1),(13,'2025-07-23 11:11:48.905935','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Last checked\"]}}]',10,1),(14,'2025-07-23 11:21:35.683238','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(15,'2025-07-23 11:25:31.355788','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(16,'2025-07-23 11:30:49.541101','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(17,'2025-07-23 11:39:47.441407','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(18,'2025-07-23 11:50:18.383998','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(19,'2025-07-23 11:50:40.478354','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(20,'2025-07-23 11:51:55.640828','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(21,'2025-07-23 12:36:45.200191','1','Printer 1',2,'[]',10,1),(22,'2025-07-23 14:12:55.058749','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(23,'2025-07-23 14:15:55.597015','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(24,'2025-07-23 14:28:45.860273','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(25,'2025-07-23 14:29:07.801021','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(26,'2025-07-23 14:32:21.223111','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(27,'2025-07-23 14:43:18.510099','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(28,'2025-07-23 14:58:42.828769','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer status\"]}}]',10,1),(29,'2025-07-23 14:59:05.001432','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer status\"]}}]',10,1),(30,'2025-07-23 14:59:22.894188','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer status\", \"Ink status\"]}}]',10,1),(31,'2025-07-23 15:00:32.702296','1','Printer 1',2,'[]',10,1),(32,'2025-07-23 15:01:10.765056','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(33,'2025-07-23 15:01:32.473927','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer status\"]}}]',10,1),(34,'2025-07-23 15:02:53.613151','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(35,'2025-07-23 15:03:24.329916','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer status\", \"Ink status\"]}}]',10,1),(36,'2025-07-23 15:03:58.720600','1','Printer 1111',2,'[{\"changed\": {\"fields\": [\"Printer name\", \"Printer status\", \"Ink status\"]}}]',10,1),(37,'2025-07-23 15:04:24.256015','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer name\"]}}]',10,1),(38,'2025-07-23 15:18:04.959384','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Paper assigned\"]}}]',10,1),(39,'2025-07-23 15:18:15.602438','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Ink status\"]}}]',10,1),(40,'2025-07-23 15:18:51.463215','1','Printer 111',2,'[{\"changed\": {\"fields\": [\"Printer name\", \"Model name\", \"Printer status\", \"Ink status\", \"Paper assigned\", \"Paper quality\", \"Ip address\", \"Node name\"]}}]',10,1),(41,'2025-07-23 15:20:46.841646','1','Printer 12',2,'[{\"changed\": {\"fields\": [\"Printer name\", \"Model name\", \"Printer status\", \"Paper assigned\", \"Paper quality\", \"Ip address\", \"Node name\"]}}]',10,1),(42,'2025-07-23 15:26:24.729660','1','Printer 12',2,'[{\"changed\": {\"fields\": [\"Ip address\"]}}]',10,1),(43,'2025-07-23 15:28:15.673940','1','Printer 1@',2,'[{\"changed\": {\"fields\": [\"Printer name\", \"Model name\", \"Printer status\", \"Ink status\", \"Paper assigned\", \"Paper quality\", \"Ip address\"]}}]',10,1),(44,'2025-07-23 15:28:25.839922','1','Printer 1@',2,'[{\"changed\": {\"fields\": [\"Node name\"]}}]',10,1),(45,'2025-07-23 15:28:43.072634','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer name\", \"Model name\", \"Printer status\", \"Ink status\", \"Ip address\", \"Node name\"]}}]',10,1),(46,'2025-07-23 15:33:41.552033','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer status\"]}}]',10,1),(47,'2025-07-23 15:35:15.341733','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer status\"]}}]',10,1),(48,'2025-07-23 16:19:43.862435','1','Printer 1',2,'[{\"changed\": {\"fields\": [\"Printer status\", \"Last checked\"]}}]',10,1),(49,'2025-07-24 14:11:54.349149','11','Report a Problem by Anonymous',3,'',9,1),(50,'2025-07-24 14:11:54.349255','10','Report a Problem by Anonymous',3,'',9,1),(51,'2025-07-24 14:11:54.349313','9','Report a Problem by Anonymous',3,'',9,1),(52,'2025-07-24 14:11:54.349358','8','Report a Problem by Anonymous',3,'',9,1),(53,'2025-07-24 14:11:54.349397','7','Report a Problem by Anonymous',3,'',9,1),(54,'2025-07-24 14:11:54.349435','6','Report a Problem by Anonymous',3,'',9,1),(55,'2025-07-24 14:11:54.349471','5','Report a Problem by Anonymous',3,'',9,1),(56,'2025-07-24 14:11:54.349505','4','Report a Problem by Anonymous',3,'',9,1),(57,'2025-07-24 14:11:54.349541','3','Report a Problem by Anonymous',3,'',9,1),(58,'2025-07-24 14:11:54.349575','2','Report a Problem by Anonymous',3,'',9,1),(59,'2025-07-24 14:49:17.819591','DOC-YTWV','DOC-YTWV - Colored Test Print.pdf',2,'[{\"changed\": {\"fields\": [\"Doc status\"]}}]',8,1),(60,'2025-09-03 03:42:49.392231','2','admin',2,'[{\"changed\": {\"fields\": [\"Notification sound\"]}}]',7,1),(61,'2025-09-03 03:43:07.690622','2','admin',2,'[{\"changed\": {\"fields\": [\"Sound enabled\", \"Sound volume\"]}}]',7,1),(62,'2025-09-03 06:55:01.617619','1','Printer 2',2,'[{\"changed\": {\"fields\": [\"Printer name\"]}}]',10,1),(63,'2025-09-05 02:59:39.095646','4','Printer 2',3,'',10,1),(64,'2025-09-05 03:00:10.316684','4','Printer 2',3,'',10,1),(65,'2025-09-05 03:02:16.714041','4','Printer 2',3,'',10,1),(66,'2025-09-05 03:29:44.537020','4','Printer 2',3,'',10,1),(67,'2025-09-05 06:24:01.283781','DOC-4PFE','DOC-4PFE - Colored Test Print.pdf',3,'',8,1),(68,'2025-09-05 14:40:10.801043','4','@vincentperez',2,'[{\"changed\": {\"fields\": [\"Notification sound\", \"Sound enabled\"]}}]',7,1),(69,'2025-09-14 05:03:31.308301','11','11 - 11',1,'[{\"added\": {}}]',8,1),(70,'2025-09-14 05:03:50.336597','11','11 - 11',2,'[{\"changed\": {\"fields\": [\"Doc status\"]}}]',8,1),(71,'2025-09-14 08:22:06.170721','11','11 - 11',1,'[{\"added\": {}}]',8,1),(72,'2025-09-14 08:23:04.875354','11','11 - 11',2,'[{\"changed\": {\"fields\": [\"Doc status\"]}}]',8,1);
/*!40000 ALTER TABLE `django_admin_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `django_content_type`
--

DROP TABLE IF EXISTS `django_content_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_content_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_label` varchar(100) NOT NULL,
  `model` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `django_content_type_app_label_model_76bd3d3b_uniq` (`app_label`,`model`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `django_content_type`
--

LOCK TABLES `django_content_type` WRITE;
/*!40000 ALTER TABLE `django_content_type` DISABLE KEYS */;
INSERT INTO `django_content_type` VALUES (1,'admin','logentry'),(3,'auth','group'),(2,'auth','permission'),(4,'auth','user'),(5,'contenttypes','contenttype'),(7,'portal','adminuser'),(8,'portal','document'),(9,'portal','feedback'),(13,'portal','notificationsound'),(11,'portal','payment'),(10,'portal','printer'),(12,'portal','reroutehistory'),(6,'sessions','session');
/*!40000 ALTER TABLE `django_content_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `django_migrations`
--

DROP TABLE IF EXISTS `django_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_migrations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `app` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `applied` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `django_migrations`
--

LOCK TABLES `django_migrations` WRITE;
/*!40000 ALTER TABLE `django_migrations` DISABLE KEYS */;
INSERT INTO `django_migrations` VALUES (1,'contenttypes','0001_initial','2025-07-09 11:24:58.835281'),(2,'auth','0001_initial','2025-07-09 11:25:00.097926'),(3,'admin','0001_initial','2025-07-09 11:25:00.414183'),(4,'admin','0002_logentry_remove_auto_add','2025-07-09 11:25:00.437200'),(5,'admin','0003_logentry_add_action_flag_choices','2025-07-09 11:25:00.459650'),(6,'contenttypes','0002_remove_content_type_name','2025-07-09 11:25:00.686513'),(7,'auth','0002_alter_permission_name_max_length','2025-07-09 11:25:00.828707'),(8,'auth','0003_alter_user_email_max_length','2025-07-09 11:25:00.888109'),(9,'auth','0004_alter_user_username_opts','2025-07-09 11:25:00.914845'),(10,'auth','0005_alter_user_last_login_null','2025-07-09 11:25:01.029380'),(11,'auth','0006_require_contenttypes_0002','2025-07-09 11:25:01.035927'),(12,'auth','0007_alter_validators_add_error_messages','2025-07-09 11:25:01.058799'),(13,'auth','0008_alter_user_username_max_length','2025-07-09 11:25:01.194133'),(14,'auth','0009_alter_user_last_name_max_length','2025-07-09 11:25:01.339268'),(15,'auth','0010_alter_group_name_max_length','2025-07-09 11:25:01.388462'),(16,'auth','0011_update_proxy_permissions','2025-07-09 11:25:01.411029'),(17,'auth','0012_alter_user_first_name_max_length','2025-07-09 11:25:01.555166'),(19,'portal','0002_printer_model_name_alter_printer_id_and_more','2025-07-09 11:25:03.308917'),(20,'portal','0003_alter_reroutehistory_options_and_more','2025-07-09 11:25:03.374573'),(21,'portal','0004_alter_document_doc_status_alter_document_pages_num','2025-07-09 11:25:03.546524'),(22,'portal','0005_alter_document_color_mode_alter_document_orientation_and_more','2025-07-09 11:25:03.587820'),(23,'portal','0006_alter_document_paper_size_and_more','2025-07-09 11:25:03.599526'),(24,'sessions','0001_initial','2025-07-09 11:25:03.676280'),(25,'portal','0001_initial','2025-07-09 15:12:27.327531'),(26,'portal','0002_rename_printer_serialnumber_printer_ip_address_and_more','2025-07-22 16:19:10.635541'),(27,'portal','0003_printer_ink_status_alter_printer_id','2025-07-23 09:42:25.561910'),(28,'portal','0004_document_pages_printed','2025-07-24 08:52:03.787672'),(29,'portal','0005_notificationsound_and_adminuser_sound_prefs','2025-09-03 01:39:15.840769'),(30,'portal','0006_set_default_chime_for_existing_users','2025-09-03 01:39:15.865305'),(31,'portal','0007_alter_notificationsound_id','2025-09-03 01:39:16.232852'),(32,'portal','0008_remove_volume_fields','2025-09-03 05:33:14.501233'),(33,'portal','0009_printer_machine_info','2025-09-13 02:54:49.910722'),(34,'portal','0010_alter_printer_machine_info','2025-09-13 02:58:32.596840'),(35,'portal','0011_remove_printer_machine_info','2025-09-13 03:48:26.187063');
/*!40000 ALTER TABLE `django_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `django_session`
--

DROP TABLE IF EXISTS `django_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_session` (
  `session_key` varchar(40) NOT NULL,
  `session_data` longtext NOT NULL,
  `expire_date` datetime(6) NOT NULL,
  PRIMARY KEY (`session_key`),
  KEY `django_session_expire_date_a5c62663` (`expire_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `django_session`
--

LOCK TABLES `django_session` WRITE;
/*!40000 ALTER TABLE `django_session` DISABLE KEYS */;
INSERT INTO `django_session` VALUES ('26sidrv7zwkikhohfd3n7lzmdcodghzg','.eJxVj81OwzAQhN_FZxwl63-OwKWHPoPl9a5JaGujOjkgxLuTSkWo15n5Pmm-RaLLUuPW-RoXEs_wJGLa1vk_EZN4yDDlE9dbQR-pvrcht7peFxxuk-He9uHYiM8v9-2DYE593ulxSmi8HpkJxozOU2Kvg0UG8sGrVJSzaLNB1M6ZrF1RJYcyjZq1smWXbp_nlih27n1pNZ74a_cWtgRlAonWBakDWRmgZGnYIgVgZXTe2bz1tV3-Pr4e3iSACuLnF5CbWAQ:1udT2T:9VFFPhFeQVLsEzy_JwsXKPBDuP7cDg5ww1UQu5gf2QU','2025-08-03 12:21:09.555293'),('3b4797tfc6cp43rbccm74vel95y54wi5','eyJhZG1pbl91c2VyX2lkIjoyLCJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiIxZDJhZjc2YS05MzNjLTQzNzAtYTlkNy01MWQwODE3ZjQ4ZTQiLCJjdXN0b21lcl9pZCI6IkNJRC0xNjMxIn0:1uvyX8:hbZtHP3gCJfGp8gilMJOGR0xLUjOtqLWk5ibOrxLpkg','2025-09-23 13:37:18.983619'),('4nn2f83znq977ojpxkwmrajiip25v9va','eyJhZG1pbl91c2VyX2lkIjo1fQ:1uxLdU:nj71xZAm5f3gKEFob_iFiWRUQ74eR3JGYGTfbNKnCtU','2025-09-27 08:29:32.758265'),('4rqn10ruitqdu2x2rr0s8lv1kmmb3c03','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiJjNDNhMjBjNS0wNzQ0LTQ1ZTQtODUyZS0yOGQzZTA4ZDQyNWYiLCJjdXN0b21lcl9pZCI6IkNJRC03NDg1In0:1ut3rD:VbO6_yF3BScYJRG26R11O-i92eGkVAv5IGYuATQkFUo','2025-09-15 12:41:59.893918'),('4suj0mc5cmzm35d3eqmn7gw1be4hbwx1','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uwKL1:v3aSk9hitzFqcEIoLlz7B7k_1xsbDC9vkHhW_Mg66mQ','2025-09-24 12:54:15.704524'),('5102f4ecybwqmonwwq6cexfza2zfx6ww','.eJxVjEkOwjAQBP_iM7LseA1H7rzBmvGMcVgcKcsJ8XeIFAnlWlXdbwH0GlpaZ57SQOLcnUSCdal_IrQ4MIT84LYJukO7jTKPbZkGlFsidzvL60j8vOzt4aDCXH9rpQFdtIqZOpUxRAKOtvfIHcU-GigmePTZIdoQXLahmJL7opVla3wRny9WeT5x:1vPe8m:7OJq1B_sDXDRSd8YMqqxGx10uP-CcEVhNF-IA3MKKQs','2025-12-14 09:54:48.832177'),('5wo0dz36t4f3kvp887z7g42e95s5t6cz','eyJhZG1pbl91c2VyX2lkIjoyfQ:1upi0a:Zm28NaGMdvWZz6MF4zFs6WT01sdzFOj4bNzVfPpqYMA','2025-09-06 06:45:48.000606'),('60282s8ru71nzcku61nwmeymfsgi4tuw','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI4NjU0YjUwMS0zOTVkLTQzZWUtOWNhOS03Njc3NGE3ZjIxZjMiLCJjdXN0b21lcl9pZCI6IkNJRC0xODEzIn0:1udP5A:SZRiNPXXOjEyDnM_MdznmEUumktxnxLG6cg5-M3jhjA','2025-08-03 08:07:40.708262'),('6gtgme0hpinftuq6aj5t7c04kshtrl5s','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiJmNDZkNzc2MS1mYzk2LTQ3YWYtYTQyNi0wNWExNTY0MzJlYWEiLCJjdXN0b21lcl9pZCI6IkNJRC02MTA0In0:1utRd1:8gEgrek8qX2jBesvyWEWT22uY8IEOYCI74CbRoWPQAQ','2025-09-16 14:04:55.511898'),('6kkisvlpuagwgmzrlad1asrjv07y2o1b','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiIxMzZiY2ZiOS05MGE0LTQyYWYtOGFkNS0wNzliNDVhZGI5MTkiLCJjdXN0b21lcl9pZCI6IkNJRC04MTkzIn0:1ueGu4:VzpZYB-4wftIWNZLBE7qhAAHMmTZNVoFR8shPjo_wCs','2025-08-05 17:35:48.024599'),('7ut0mj924g0swh4qz2vs2ewx2xw5bec1','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uexev:ZTjhq4JBFdd345YQJ_ltX2qZkE9oIa4YRJqciuVJi1I','2025-08-07 15:15:01.842479'),('azz4vjhoa1n3p4kqdghku9rqz1z9htg7','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uczdu:NC6ZgB9I0XJjgR8xVztVAAjKWy8IpJY0t_uK1FufLjA','2025-08-02 04:57:50.662889'),('bewp3gvbpuw5l5sg32vy2iv1ramkice0','.eJxVjEkOwjAQBP_iM7LseA1H7rzBmvGMcVgcKcsJ8XeIFAnlWlXdbwH0GlpaZ57SQOLcnUSCdal_IrQ4MIT84LYJukO7jTKPbZkGlFsidzvL60j8vOzt4aDCXH9rpQFdtIqZOpUxRAKOtvfIHcU-GigmePTZIdoQXLahmJL7opVla3wRny9WeT5x:1uecBf:G5F31P5GDtY-3E4purOyzLf6GBRrrmIb7Bf6FkGCfeA','2025-08-06 16:19:23.257285'),('c2j4j98afd20aegz09kx1hbdktr22wsy','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI2MDMxMDY4Mi1iMjVmLTRlMGEtODZhZi03MmU0YjNkYjc1YzQiLCJjdXN0b21lcl9pZCI6IkNJRC01OTkzIn0:1utRLB:9JSoIpab-yDxG3VdJ_VHAOxsbmeNexVOQdZp_hMka_k','2025-09-16 13:46:29.501823'),('cpns7ck5q6wwcjvv8rrcz841iv97z3e6','.eJxVj81OwzAQhN_FZxwl8c86HIFLD30Ga9e7JqGtjerkgBDvTioVoV5n5vuk-VbIl6XErck1LqyexycVcVvn_0QN6iEjTCcpt4I_sLzXLtWyXhfqbpPu3rbuWFnOL_ftg2DGNu90PyC5YHsRHvtEEBgl2MmTjBymYDAb8OSTI7IALlnIJqcpD70Va3zepdvnuSLHJq0ttcSTfO3ewGxSQKPZU9YWATWhFx1GdDBkEJBpZ9PW1nr5-_h6eNPOeVA_v6quWJE:1uexE4:f4dFHP4W_awziGNIqYXnc-H66ZUNq7nTtM_4iSZd-xI','2025-08-07 14:47:16.325700'),('ct3g6si2h619agein6ibcwvsw5f1dfwu','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiIxOGRhNjUyZC1lMzUxLTRlOTktOTEyYS03NTUyZTAxNjAwNTAiLCJjdXN0b21lcl9pZCI6IkNJRC0yOTQyIn0:1upi1P:3PzW7VuWzkTclruTTU9a-bh7E-_tz6cszwWMe9OWtJs','2025-09-06 06:46:39.298174'),('ezgf8x2ghnoze2v0dpbno1znywlz6qzj','.eJxVjMsOwiAQRf-FtSFQ3i7d-w1kBgapGkhKuzL-uzbpQrf3nHNfLMK21rgNWuKc2ZlJdvrdENKD2g7yHdqt89TbuszId4UfdPBrz_S8HO7fQYVRv7WQgMZrQZQnkdD5DOR1sEhT9sErKMpZtMkgaudM0q6okkKRQpNWtrD3B_OVOEI:1uevW0:M59kloKcxBHhylz8Bxn26GfokRrvXrqeklu590QkD0g','2025-08-07 12:57:40.291655'),('f9hz29ew8163kz0k2yp8br2a1o9wl4za','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uyAZw:HQFkO_sJFepXm_HOfOKuZkjTykyBHQyHoXtlbYtTPGg','2025-09-29 14:53:16.526942'),('fivk596hhyci94m28xaqiyaww0svs9o0','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiJiZDk1NWIzMC01ZTk4LTQ5NzMtYTA0OS05M2NkNmNiNGUxMDMifQ:1vICI9:pXKfXW3Y5r2bF8ikvpImmQe7yCUCpoaZgA8hF_iU0mk','2025-11-23 20:45:41.626196'),('fyaujctcbkgyx11wx85t05xf58tjk5cj','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiJmNzkxOTc2Zi00NDQ2LTRlYjUtOGU1ZS04YTAzMjdkZDUyM2QifQ:1uoetm:UhUSfnOagPuDwFcisoan7MdFAFJ79zONDoZKqwAjIN0','2025-09-03 09:14:26.965114'),('gxznhfad8k2fqk55jnsdeaslcb9hrb1b','eyJhZG1pbl91c2VyX2lkIjoyfQ:1v49mf:EcHUVp9L0OlLcQgjivZ-Lx7MUI4sKnfjX8SxkUZ3Axc','2025-10-16 03:15:09.901398'),('hke6xj0nphfau0yx8i3c18u700aoj1sg','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI1NjgwNzhjZC01YzFiLTQ0MjctYTZiNy1iOGFmMDBiZjA5MjQiLCJjdXN0b21lcl9pZCI6IkNJRC0yOTg4In0:1v5135:pZdPjXQiBFvU0QAhSYeWaT6PV13d_4FPSTsp8KcIhR4','2025-10-18 12:07:39.123078'),('idqo55f7okefse4rl4mhe5ei3mzdwc6y','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uuPqF:wIXV06s7TvcJKLlrqTVYO5q16nuTic8TwNmz7A4V1SY','2025-09-19 06:22:35.800661'),('iyc4nyehxl54nwumwkssnrk3cjfjo97b','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uesJm:f-GujbsNRyS2sjD2s2zzgHLC3brj5QlTX4OTXFt1eC8','2025-08-07 09:32:50.350617'),('k42uy9lrjeodhd9idbx6l22tjf87ncld','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI1M2Y5MGU2OS0yNWE3LTQyZjEtOGM3My0yM2I0YzhmNDE2ZDcifQ:1v5134:UvBw76Mj5CiK7Cj9DWv23noiZOCjjJgz3xu8tGxjp6c','2025-10-18 12:07:38.167919'),('meh49ggre10boigbe99s7pnnjgilkyw2','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiJmOGM3MmI4NS0zY2JjLTRlYzgtYTY0NC02ZTkzY2M1ZTY1N2EiLCJjdXN0b21lcl9pZCI6IkNJRC0zNDA1In0:1v74uD:D-EvZQ76q_zPSLwK3Cy6BZJxc9wifPP6Ad4ZQWYFLqM','2025-10-24 04:39:01.918609'),('mxgvnv3yi9y95p3ptmp2maftrgcoz1sr','.eJxVjMsOwiAQRf-FtSFQ3i7d-w1kBgapGkhKuzL-uzbpQrf3nHNfLMK21rgNWuKc2ZlJdvrdENKD2g7yHdqt89TbuszId4UfdPBrz_S8HO7fQYVRv7WQgMZrQZQnkdD5DOR1sEhT9sErKMpZtMkgaudM0q6okkKRQpNWtrD3B_OVOEI:1uevVq:qLWMdwaPsZ8GNCr24C2WCq0_8sNB8UQGMA5FJXX_KU0','2025-08-07 12:57:30.720049'),('nkiq89zxfxrd535ccdwtp64uhqucrlz5','.eJxVjEkOwjAQBP_iM7LseA1H7rzBmvGMcVgcKcsJ8XeIFAnlWlXdbwH0GlpaZ57SQOLcnUSCdal_IrQ4MIT84LYJukO7jTKPbZkGlFsidzvL60j8vOzt4aDCXH9rpQFdtIqZOpUxRAKOtvfIHcU-GigmePTZIdoQXLahmJL7opVla3wRny9WeT5x:1v5161:bSJn54BQjgAry0ffmobvWPKw3CpfYUwdY9kiqz84yL4','2025-10-18 12:10:41.281528'),('po3aksnmq04z5o0eo01rwwl660er85g7','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI1NzVjMTM5Yi02MGIxLTRlYjItOTlhNi01NzUwNTg2NWQwYjEiLCJjdXN0b21lcl9pZCI6IkNJRC0xMTc3In0:1uewbR:EyxeruJEnkR8ti9jMl0LvarEuFooLnkRWKIsLO20YIY','2025-08-07 14:07:21.381945'),('qsf30zdiv563zmp96z3sf4tjvjgtky25','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI1YjU5NTcwMS01M2VhLTQ2YjctYmVhYS04MmU1MjAzZDkyMWIiLCJjdXN0b21lcl9pZCI6IkNJRC04OTkyIn0:1uquDw:fXI0Voj5Xdf0D4uT1CtFuxg_GTMBRuoNBfoYU_gHe0A','2025-09-09 14:00:32.630978'),('qvbz7ugrx1yq9hjtgiyg69cm9f962kil','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uuWjZ:hgaDcBhLBFD6x3uH-rxpLhUmoW0GMbUu1P_D9tLLRMw','2025-09-19 13:44:09.135839'),('rar743e66tqsasq6q53r32j3wcd5crr4','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uxK83:NyHys3S7OCEKXDQX5frDj8OPLmHUF6S3itNoZNetuo4','2025-09-27 06:52:59.790275'),('rknf4mia6ddlymbaerx2w9unnskfwn5o','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiJkZTllMmJjMi0yYzc2LTQxZjQtODkxMi1kZGU2ZTYyNWVjZWUiLCJjdXN0b21lcl9pZCI6IkNJRC04MzEwIn0:1vjuLe:2bnTA-qtUmVxrZPf7U70V6tZs4n759EgLBiQ9YGbu0k','2026-02-08 07:15:50.992245'),('ts9jxw3bkmxcb0op4ukiiggth5ouh87n','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uvH98:JmOaPwaJGjLnhXBz6TAxZ2660hP1Smg4M-KNflX5emM','2025-09-21 15:17:38.045052'),('uigffmjv747vpq9132pgreuq78uo03yp','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI3MWQxM2RlMi0yMzBkLTQxMjktYmQwYy04Mjk0OGFhNWI5NmIiLCJjdXN0b21lcl9pZCI6IkNJRC01NTYxIn0:1uxMDm:Khm7He0HBXfJeS0NxmbmXRj9cAGlzglyxLihc-6f_Qg','2025-09-27 09:07:02.736867'),('vcun71vzlwm8ofd445r9yzs16gcfmeim','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiJmNDQ4MTc5Zi1kYzBhLTQ4YjMtODIzYy02ZDg5Y2U2ZjQ5NDEifQ:1uogRq:JSAl4EGuh6sNH7bh3rXi1IwxO4wya7paPMCs0njuWbk','2025-09-03 10:53:42.754200'),('vr581hluj4xk9kmo9t17x0gp5vsk100y','eyJhZG1pbl91c2VyX2lkIjoyfQ:1uuWSj:0jbQTynrBoXR0VE8PKeLxVR48BtVrr4uWYis7bLwFCU','2025-09-19 13:26:45.203359'),('w8tkkohhsygfqqnlgi8lhy2mf2v790s9','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiIzY2I1NTY4ZC03YTg4LTRlZTItYjZhMy0yNzdmMDY3ZDBiMDEiLCJjdXN0b21lcl9pZCI6IkNJRC03NDk5In0:1ueGS3:ZzlEbeENL4d9JG1rwQFprZP1XWwY3HUe49YXwqmM_dU','2025-08-05 17:06:51.836076'),('xr5m4hds3udwntbvrydynetu7w1563ej','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI0NjdiMzdiMC1lZTE0LTRmODAtYjZiYi0zZGNmNjdlMTEwODIiLCJjdXN0b21lcl9pZCI6IkNJRC0yNjE5In0:1uZX2W:7wiN5fWLzWuUj6ECWH-hhQIqLsFPIGtSf2-5Q3Q6DPM','2025-07-23 15:48:56.823402'),('y3yg4s3zaj08a501ogyh5o1f6nzfjkjm','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiIzM2RlYTQ3MC0yZjY3LTRhZGItODY1YS0yYzU0ZmFmMmQ4MjcifQ:1uplip:Fles-yBRILeeusgXVm0nxFZaDZHG-bdyrpM8R4lZFwY','2025-09-06 10:43:43.548556'),('yluzjzc1bg194crjp9h1p6ub93vzjdgd','.eJxVjEkOwjAQBP_iM7LseA1H7rzBmvGMcVgcKcsJ8XeIFAnlWlXdbwH0GlpaZ57SQOLcnUSCdal_IrQ4MIT84LYJukO7jTKPbZkGlFsidzvL60j8vOzt4aDCXH9rpQFdtIqZOpUxRAKOtvfIHcU-GigmePTZIdoQXLahmJL7opVla3wRny9WeT5x:1uxl6e:Ag4l6oapU5uSasavExpoh1W2gR9hQ4mGDMI06rEOjDU','2025-09-28 11:41:20.399309'),('zaqb94ppch8ilgq6oudlybhejwvuknce','eyJhZG1pbl91c2VyX2lkIjoyfQ:1vPakE:ckrubZhTG-dBdh2snV7zj8DK1g8uGCSrcKfjNdhbvOQ','2025-12-14 06:17:14.414149'),('zfvshlhkegrm507hk7tbrtu5hv4d7kkp','eyJ1cGxvYWRfc2Vzc2lvbl9rZXkiOiI0Y2E1NzFmNy1hN2NhLTQ4ZjAtYWM1Ny1mOWI3NDMzMTIwNTMifQ:1ueGME:F2VklGLmD_DtqyMHL-yHL7LXiICfz29wzgJhRP5cFWI','2025-08-05 17:00:50.169020');
/*!40000 ALTER TABLE `django_session` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `documents`
--

DROP TABLE IF EXISTS `documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `documents` (
  `doc_id` varchar(255) NOT NULL,
  `customer_id` varchar(255) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `num_copies` int NOT NULL,
  `pages_num` varchar(255) NOT NULL,
  `orientation` varchar(50) NOT NULL,
  `color_mode` varchar(50) NOT NULL,
  `paper_size` varchar(50) NOT NULL,
  `paper_quality` varchar(50) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_type` varchar(50) NOT NULL,
  `file_size` int NOT NULL,
  `doc_status` varchar(50) NOT NULL,
  `status_updated_at` datetime(6) NOT NULL,
  `time_submitted` datetime(6) NOT NULL,
  `printed_at` int DEFAULT NULL,
  `printer_assigned_id` int DEFAULT NULL,
  `pages_printed` json NOT NULL DEFAULT (_utf8mb4'[]'),
  PRIMARY KEY (`doc_id`),
  KEY `documents_printer_assigned_id_1bf4cd15_fk` (`printer_assigned_id`),
  KEY `documents_printed_at_8de70f0a_fk` (`printed_at`),
  CONSTRAINT `documents_printed_at_8de70f0a_fk` FOREIGN KEY (`printed_at`) REFERENCES `printers` (`id`),
  CONSTRAINT `documents_printer_assigned_id_1bf4cd15_fk` FOREIGN KEY (`printer_assigned_id`) REFERENCES `printers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `documents`
--

LOCK TABLES `documents` WRITE;
/*!40000 ALTER TABLE `documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `feedback`
--

DROP TABLE IF EXISTS `feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feedback` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `message` longtext NOT NULL,
  `submitted_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `feedback`
--

LOCK TABLES `feedback` WRITE;
/*!40000 ALTER TABLE `feedback` DISABLE KEYS */;
INSERT INTO `feedback` VALUES (12,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-P1CN paused.','2025-09-13 05:15:39.384614'),(13,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-NXTX paused.','2025-09-13 05:26:10.873386'),(14,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-NXTX paused.','2025-09-13 05:26:38.018287'),(15,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-NXTX paused.','2025-09-13 05:26:58.076980'),(16,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-NXTX paused.','2025-09-13 05:27:18.143291'),(17,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-NXTX paused.','2025-09-13 05:28:03.262641'),(18,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-NXTX paused.','2025-09-13 05:28:23.365306'),(19,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-NXTX paused.','2025-09-13 05:28:49.542798'),(20,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:32:11.240405'),(21,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:32:39.415419'),(22,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:32:59.500701'),(23,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:33:19.572787'),(24,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:33:39.665919'),(25,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:33:59.769584'),(26,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:34:19.852913'),(27,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:34:39.927217'),(28,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:35:00.004322'),(29,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:35:20.075895'),(30,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:35:40.145715'),(31,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:36:00.246566'),(32,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:36:20.322643'),(33,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:36:40.409709'),(34,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:36:56.565779'),(35,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-V88B paused.','2025-09-13 05:37:16.639325'),(36,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-8WRA paused.','2025-09-13 05:45:44.427500'),(37,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-9Y77 paused.','2025-09-13 05:53:35.052297'),(38,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-E5MX paused.','2025-09-13 06:30:08.685268'),(39,'Report a Problem','[SYSTEM GENERATED]','Reroute failed: No available printer for A4. Document DOC-NOF7 paused.','2025-09-13 07:35:08.264662');
/*!40000 ALTER TABLE `feedback` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_sounds`
--

DROP TABLE IF EXISTS `notification_sounds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_sounds` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) NOT NULL,
  `display_name` varchar(100) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_sounds`
--

LOCK TABLES `notification_sounds` WRITE;
/*!40000 ALTER TABLE `notification_sounds` DISABLE KEYS */;
INSERT INTO `notification_sounds` VALUES (1,'chime','Chime','/static/sounds/chime.mp3',1),(2,'chananan','Chananan','/static/sounds/chananan.mp3',1),(3,'taposnapo','Tapos Na Po','/static/sounds/taposnapo.mp3',1),(4,'tugting','Tugting','/static/sounds/tugting.mp3',1),(5,'tuntang','Tuntang','/static/sounds/tuntang.mp3',1),(6,'tuwawang','Tuwawang','/static/sounds/tuwawang.mp3',1);
/*!40000 ALTER TABLE `notification_sounds` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `price` decimal(10,2) NOT NULL,
  `payment_status` varchar(50) NOT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `approved_at` datetime(6) DEFAULT NULL,
  `doc_id` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `payments_doc_id_74d68d91_fk_documents_doc_id` (`doc_id`),
  CONSTRAINT `payments_doc_id_74d68d91_fk_documents_doc_id` FOREIGN KEY (`doc_id`) REFERENCES `documents` (`doc_id`)
) ENGINE=InnoDB AUTO_INCREMENT=141 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `printers`
--

DROP TABLE IF EXISTS `printers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `printers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `printer_name` varchar(255) NOT NULL,
  `model_name` varchar(255) DEFAULT NULL,
  `printer_status` varchar(50) NOT NULL,
  `paper_assigned` varchar(50) NOT NULL,
  `paper_quality` varchar(50) NOT NULL,
  `last_checked` datetime(6) NOT NULL,
  `ip_address` varchar(255) NOT NULL,
  `node_name` varchar(255) DEFAULT NULL,
  `ink_status` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `printers`
--

LOCK TABLES `printers` WRITE;
/*!40000 ALTER TABLE `printers` DISABLE KEYS */;
INSERT INTO `printers` VALUES (14,'Printer 1','Brother DCP-T510W','Offline','Long','70','2026-02-07 06:17:35.594720','192.168.0.101','BRW2C6FC9187DBE','OK'),(15,'Printer 2','Brother DCP-T820DW','Offline','Long','70','2026-02-07 06:17:49.634272','192.168.0.102','BRW44FA6676C562','OK');
/*!40000 ALTER TABLE `printers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reroute_history`
--

DROP TABLE IF EXISTS `reroute_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reroute_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `status` varchar(50) NOT NULL,
  `timestamp` datetime(6) NOT NULL,
  `document_id` varchar(255) NOT NULL,
  `printer_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reroute_history_document_id_aa999e8d_fk_documents_doc_id` (`document_id`),
  KEY `reroute_history_printer_id_0523d13d_fk` (`printer_id`),
  CONSTRAINT `reroute_history_document_id_aa999e8d_fk_documents_doc_id` FOREIGN KEY (`document_id`) REFERENCES `documents` (`doc_id`),
  CONSTRAINT `reroute_history_printer_id_0523d13d_fk` FOREIGN KEY (`printer_id`) REFERENCES `printers` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=218 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reroute_history`
--

LOCK TABLES `reroute_history` WRITE;
/*!40000 ALTER TABLE `reroute_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `reroute_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'SAFEPRINT_DB'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-07  6:18:00
